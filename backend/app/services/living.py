"""Factual read models. No provider calls, inference, global scores or hidden weights."""
from collections import Counter
from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import domain as m
from app.schemas import living as s
from app.services.matching.material import load_material, calculate_for_need
from app.services.workflows import get_or_404, serialize_match

AUTHORSHIP = 'Repository-level evidence; individual authorship not verified. Repo bağlantısı adayın kodu yazdığını doğrulamaz.'
COUNTS = 'Sayılar kayıt kapsamını gösterir; kalite, yetenek veya gelişim puanı değildir.'
FAMILIES = {'education': 'Eğitim', 'certification': 'Sertifika', 'hackathon': 'Hackathon',
            'community': 'Topluluk', 'event': 'Etkinlik', 'portfolio': 'Portföy'}


def facts(**counts):
    return [s.CountFact(label=label, count=count) for label, count in counts.items()]


def profile(db: Session, candidate_id: UUID, since: date | None = None):
    get_or_404(db, m.Candidate, candidate_id)
    data = load_material(db, [candidate_id])[candidate_id]
    categories = Counter(p.category for p in data.profiles)
    observed = [e for e in data.evidence if e.evidence_status == 'observed']
    counts = {'Proje': len(data.projects), 'Gözlemlenen teknik kanıt': len(observed)}
    counts.update({label: categories[key] for key, label in FAMILIES.items()})
    passport = Counter((e.evidence_type, e.evidence_status) for e in data.evidence)
    passport.update((p.category, p.verification_status) for p in data.profiles)
    observed_projects = {e.project_id for e in observed}
    timeline = [s.TimelineItem(id=p.id, date=p.created_at.date(), date_basis='recorded_at',
        category='project', title=p.name, organization='', role='',
        status='observed' if p.id in observed_projects else 'linked', source_url=p.source_url) for p in data.projects]
    for p in data.profiles:
        choices = [(p.started_at, 'started_at'), (p.metadata_json.issued_at, 'issued_at'),
                   (p.ended_at, 'ended_at'), (p.created_at.date(), 'recorded_at')]
        day, basis = next((d, b) for d, b in choices if d is not None)
        timeline.append(s.TimelineItem(id=p.id, date=day, date_basis=basis, category=p.category,
            title=p.title, organization=p.organization, role=p.role or p.metadata_json.participation_type or '',
            status=p.verification_status, source_url=p.source_url))
    timeline = sorted((t for t in timeline if since is None or t.date >= since), key=lambda t: (t.date, str(t.id)))
    return s.LivingProfile(candidate_id=candidate_id, summary=facts(**counts), timeline=timeline,
        talent_map={
            'Teknik Üretim': facts(Proje=len(data.projects), **{'Gözlemlenen teknik kanıt': len(observed)}),
            'Öğrenme & Gelişim': facts(Eğitim=categories['education'], Sertifika=categories['certification']),
            'Hackathon Deneyimi': facts(Kayıt=categories['hackathon'], **{'Kaynak bağlantısı': sum(p.category == 'hackathon' and p.verification_status == 'linked' for p in data.profiles)}),
            'Topluluk Katkısı': facts(Kayıt=categories['community'], Organizatör=sum(p.category == 'community' and p.metadata_json.participation_type == 'organizer' for p in data.profiles)),
            'Proje & Üretim Çıktıları': facts(Portföy=categories['portfolio'], Etkinlik=categories['event']),
        }, passport=[s.PassportFact(family=f, status=status, count=n) for (f, status), n in sorted(passport.items())],
        limitations=[COUNTS, AUTHORSHIP, 'Yalnız son başarılı proje analizleri sayılır. Tarihi olmayan kayıtlar eklenme tarihiyle gösterilir; bu tarih deneyimin tarihi değildir.',
            'Bağlantılar bağımsız doğrulanmaz. Sürekli senkronizasyon ve adayla doğrulanmış GitHub kimlik bağlantısı yoktur.'] + data.uncertainties)


def gap_items(result):
    items = []
    for c in result.matched_criteria + result.unmatched_criteria:
        technical = c.kind in {'technical_skill', 'project_experience'}
        items.append(s.GapItem(criterion_id=c.criterion_id, label=c.skill_label, priority=c.priority,
            state='strength' if c.matched else 'required_gap' if c.priority == 'required' else 'preferred_gap',
            explanation='Bu ihtiyaç kriterini destekleyen kayıt bulundu.' if c.matched else
                f'Mevcut profil verilerinde {c.skill_label} kriterine ilişkin yeterli kanıt bulunamadı. Bu, becerinin olmadığı anlamına gelmez.',
            next_step=None if c.matched else
                f'Varsa {c.skill_label} kriterini destekleyen gerçek bir projeyi ekleyip analiz edebilirsiniz.' if technical else
                f'Varsa ilgili {FAMILIES.get(c.kind, "deneyim")} kaydınızı ve kaynak bağlantısını profilinize ekleyebilirsiniz.'))
    return items


def gaps(db, match_id):
    result = serialize_match(get_or_404(db, m.MatchResult, match_id))
    return s.GapSummary(match_id=match_id, items=gap_items(result))


def candidate_view(candidate, result, material, anonymous):
    evidence = {e.id: e for e in material.evidence}
    criteria = []
    for c in result.matched_criteria + result.unmatched_criteria:
        sources = Counter((evidence[eid].evidence_type, evidence[eid].evidence_status) for eid in c.evidence_ids)
        sources.update((p.category, p.verification_status) for p in c.profile_evidence)
        criteria.append(s.DiscoveryCriterion(criterion_id=c.criterion_id, label=c.skill_label,
            family=c.kind, priority=c.priority, matched=c.matched,
            sources=[s.EvidenceReference(family=f, status=status, count=n) for (f, status), n in sorted(sources.items())]))
    return s.DiscoveryCandidate(candidate_id=candidate.id,
        label=f'Aday #{str(candidate.id)[:8]}' if anonymous else candidate.name,
        score=result.score, required_coverage=result.required_coverage, preferred_coverage=result.preferred_coverage,
        criteria=criteria)


def need_and_views(db, need_id, candidates, anonymous):
    need = get_or_404(db, m.OrganizationNeed, need_id)
    if not need.criteria:
        raise AppError('MATCHING_FAILED', 'Önce ihtiyaç kriterlerini belirleyin.', 422)
    materials = load_material(db, [c.id for c in candidates])
    return need, [candidate_view(c, calculate_for_need(need, materials[c.id]), materials[c.id], anonymous) for c in candidates]


def discovery(db, need_id, anonymous=True, offset=0, limit=20):
    # Stable candidate cohorts, not an unbounded global ranking or page-local top-N claim.
    candidates = db.scalars(select(m.Candidate).order_by(m.Candidate.created_at, m.Candidate.id).offset(offset).limit(limit + 1)).all()
    _, views = need_and_views(db, need_id, candidates[:limit], anonymous)
    order = {c.id: i for i, c in enumerate(candidates)}
    views.sort(key=lambda v: (-v.score, order[v.candidate_id]))
    return s.Discovery(need_id=need_id, anonymous=anonymous, offset=offset, limit=limit,
        has_more=len(candidates) > limit, candidates=views,
        ordering='Adaylar eklenme sırasıyla sayfalanır. Yalnız bu sayfadaki adaylar Kanıt Uyumu azalan sırayla gösterilir; eşitlikte eklenme sırası ve kayıt kimliği kullanılır.',
        limitations=[AUTHORSHIP, 'Bu bir genel aday sıralaması değildir. 80/20 kriter kapsamı formülü korunur; kayıt sayısı bonus vermez.',
            'Kanıt odaklı görünüm kimlik alanlarını ve kaynak serbest metinlerini çıkarır; tam anonimleştirme veya erişim kontrolü değildir. UUID ile diğer açık API’lere erişim mümkündür.'])


def team(db, need_id, data):
    candidates = db.scalars(select(m.Candidate).where(m.Candidate.id.in_(data.candidate_ids)).order_by(m.Candidate.id)).all()
    if len(candidates) != len(data.candidate_ids):
        raise AppError('NOT_FOUND', 'Seçilen adaylardan biri bulunamadı.', 404)
    need, views = need_and_views(db, need_id, candidates, data.anonymous)
    criteria = []
    for criterion in need.criteria:
        supporters = [s.TeamSupport(candidate_id=v.candidate_id, label=v.label, sources=c.sources)
            for v in views for c in v.criteria if c.criterion_id == criterion.id and c.matched]
        criteria.append(s.TeamCriterion(criterion_id=criterion.id, label=criterion.skill_label,
            priority=criterion.priority, supporters=supporters))
    def coverage(priority):
        rows = [c for c in criteria if c.priority == priority]
        return sum(bool(c.supporters) for c in rows) / len(rows) if rows else 0
    return s.TeamCoverage(need_id=need_id, required_coverage=coverage('required'), preferred_coverage=coverage('preferred'),
        matched_count=sum(bool(c.supporters) for c in criteria), total_count=len(criteria), criteria=criteria,
        limitations=[AUTHORSHIP, 'Elle seçilen adayların güncel kriter kapsamı birleşimidir. Takım başarısı tahmini değildir; otomatik takım seçimi yapılmaz. Sonuç saklanmaz.'])

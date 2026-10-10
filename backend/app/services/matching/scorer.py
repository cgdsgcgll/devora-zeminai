from app.core.errors import AppError
from app.schemas.domain import (CriterionMatch, EvidenceStatus, MatchCalculation,
                                NeedCriterion, Priority, SkillEvidence)
from app.schemas.profile import ProfileEvidenceItem
from app.services.matching.profile_resolver import profile_matches, project_matches

MISSING = 'Erişilebilen proje verisinde bu kriteri destekleyen kanıt bulunamadı.'
DECLARED = 'İlgili beyan bulundu ancak eşleşme için yeterli teknik kullanım kanıtı bulunamadı. Yalnızca beyan niteliğindeki kayıtlar teknik eşleşme skoruna dahil edilmez.'


def calculate_match(criteria: list[NeedCriterion], evidence: list[SkillEvidence],
                    analysis_version: str, uncertainties: list[str] | None = None,
                    profile_evidence: list[ProfileEvidenceItem] | None = None) -> MatchCalculation:
    """Pure function. Only observed evidence counts; evidence strength is not a multiplier."""
    if not criteria:
        raise AppError('MATCHING_FAILED', 'İhtiyaç kriterleri boş; önce ihtiyaç kriterlerini belirleyin.', 422)
    if len({c.skill_key for c in criteria}) != len(criteria):
        raise AppError('MATCHING_FAILED', 'Tekrarlanan beceri kriterleri desteklenmiyor.', 422)
    rows = []
    for criterion in sorted(criteria, key=lambda c: (c.skill_key, str(c.id))):
        items = sorted({p.id: p for p in (profile_evidence or []) if profile_matches(criterion, p)}.values(), key=lambda p: str(p.id))
        ids = sorted({e.id for e in evidence if (
            criterion.kind == 'technical_skill' and e.skill_key == criterion.skill_key
            and e.evidence_status == EvidenceStatus.observed
            and e.evidence_type in {'source_file', 'dependency_file'}) or (
            criterion.kind == 'project_experience' and project_matches(criterion, e))}, key=str)
        explanation = 'Gözlemlenebilir proje kanıtı bulundu.' if ids else MISSING
        if not ids and criterion.kind == 'technical_skill' and any(
                e.skill_key == criterion.skill_key and e.evidence_status == EvidenceStatus.declared_only
                for e in evidence):
            explanation = DECLARED
        if criterion.kind not in {'technical_skill', 'project_experience'}:
            explanation = ('Aday profilinde bu kriteri destekleyen kayıt bulunamadı.' if not items else
                'İlgili profil kaydı bulundu: ' + ', '.join(sorted({
                    'Kaynak bağlantısı mevcut (içeriği doğrulanmadı)' if p.verification_status == 'linked'
                    else 'Beyan (bağımsız doğrulama yok)' if p.verification_status == 'declared_only'
                    else 'Doğrulanmış' for p in items})) + '. Bu eşleşme teknik beceri veya kişilik değerlendirmesi değildir.')
        rows.append(CriterionMatch(criterion_id=criterion.id, skill_key=criterion.skill_key,
            kind=criterion.kind, profile_evidence=items,
            skill_label=criterion.skill_label, priority=criterion.priority, matched=bool(ids or items),
            evidence_ids=ids, explanation=explanation))
    required = [r for r in rows if r.priority == Priority.required]
    preferred = [r for r in rows if r.priority == Priority.preferred]
    rc = sum(r.matched for r in required) / len(required) if required else 0.0
    pc = sum(r.matched for r in preferred) / len(preferred) if preferred else 0.0
    if required and preferred:
        score = 100 * (0.8 * rc + 0.2 * pc)
        formula = '100 × (0.80 × required_coverage + 0.20 × preferred_coverage).'
    elif required:
        score = 100 * rc
        formula = '100 × required_coverage; preferred kriter yok.'
    else:
        score = 100 * pc
        formula = '100 × preferred_coverage; required kriter yok.'
    score = round(score, 6)
    notes = list(uncertainties or [])
    notes.extend(limit for e in evidence for limit in e.limitations)
    if any(e.evidence_status != EvidenceStatus.observed for e in evidence):
        notes.append('Yalnızca beyan edilen veya not_found durumundaki kayıtlar skora dahil edilmedi.')
    notes.append('Kanıt bulunmaması adayın beceriye sahip olmadığı anlamına gelmez.')
    expanded = any(c.kind != 'technical_skill' for c in criteria)
    if expanded:
        notes.append('Profil beyanları ve bağlantıları bağımsız doğrulanmadı; yalnız açıkça istenen ilgili deneyim kriterlerini karşılar. Kayıt sayısı bonus değildir.')
    return MatchCalculation(score=score, required_coverage=rc, preferred_coverage=pc,
        scoring_version='evidence-coverage-v0.3' if expanded else 'evidence-coverage-v0.2',
        score_explanation=formula + (' Skor ilgili proje kanıtları ve açıkça istenen profil kayıtlarının kriter kapsamıdır; beyan ile doğrulama ayrı gösterilir. Genel yetenek veya işe alınma ihtimali değildir.' if expanded else
                          ' Skor gözlemlenebilir proje kanıtlarının ihtiyaçla uyumudur; işe alınma ihtimali veya genel yetenek puanı değildir.'),
        strengths=[r.skill_label + ': ' + (r.explanation if expanded else 'proje kanıtı bulundu.') for r in rows if r.matched],
        gaps=[r.skill_label + ': ' + r.explanation for r in rows if not r.matched],
        uncertainties=sorted(set(notes)), analysis_version=analysis_version,
        matched_criteria=[r for r in rows if r.matched], unmatched_criteria=[r for r in rows if not r.matched])

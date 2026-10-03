import ast

from app.schemas.domain import NeedCriterion, SkillEvidence
from app.schemas.profile import ProfileEvidenceItem


def profile_matches(criterion: NeedCriterion, item: ProfileEvidenceItem) -> bool:
    if item.category != criterion.kind:
        return False
    key, meta = criterion.skill_key, item.metadata_json
    if key == 'education_student':
        return meta.status == 'ongoing'
    if key == 'education_year_3_4':
        return meta.status == 'ongoing' and meta.student_year in (3, 4)
    if key == 'hackathon_winner':
        return meta.result == 'winner'
    if key == 'hackathon_finalist':
        return meta.result == 'finalist'
    if key == 'community_organizer':
        return meta.participation_type == 'organizer'
    if key == 'technology_community_experience':
        return meta.focus == 'technology'
    if key == 'event_speaker':
        return meta.participation_type == 'speaker'
    return key in {'certification_experience', 'hackathon_experience', 'community_experience', 'event_experience'}


def project_matches(criterion: NeedCriterion, evidence: SkillEvidence) -> bool:
    if evidence.evidence_status != 'observed' or evidence.evidence_type != 'source_file':
        return False
    if criterion.skill_key == 'project_experience':
        return True
    if criterion.skill_key == 'ai_project_experience':
        # Conservative source-code signal, not README, project title, Python or social inference.
        try:
            tree = ast.parse(evidence.excerpt)
        except SyntaxError:
            return False
        for node in ast.walk(tree):
            modules = [a.name for a in node.names] if isinstance(node, ast.Import) else [node.module or ''] if isinstance(node, ast.ImportFrom) else []
            if any(module in {'openai', 'google.genai', 'transformers', 'torch', 'tensorflow'} for module in modules):
                return True
        return False
    return False

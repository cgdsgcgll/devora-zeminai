import ast
import json
import re
import tomllib
from app.core.criteria import CATALOG, explicit_profile_criteria
from pathlib import PurePosixPath

from app.schemas.domain import (CriterionInput, EvidenceInput, NeedAnalysisInput,
                                NeedAnalysisResult, ProjectAnalysisInput, ProjectAnalysisResult)

LABELS = {'python': 'Python', 'fastapi': 'FastAPI', 'postgresql': 'PostgreSQL',
          'react': 'React', 'nextjs': 'Next.js', 'docker': 'Docker'}
ALIASES = {'python': r'python', 'fastapi': r'fastapi', 'postgresql': r'postgres(?:ql)?',
           'react': r'react(?:\.js)?', 'nextjs': r'next\.?js', 'docker': r'docker'}
AUTHOR_LIMIT = 'Contributor doğrulaması yok; repository kodunun aday tarafından yazıldığı varsayılmaz.'


def mentioned(text: str) -> list[str]:
    return [key for key, pattern in ALIASES.items()
            if re.search(r'(?<!\w)(?:' + pattern + r')(?!\w)', text, re.I)]


def dependency_skills(path: str, content: str) -> list[str]:
    name = PurePosixPath(path).name
    packages: list[str] = []
    try:
        if name == 'package.json':
            data = json.loads(content)
            for group in ('dependencies', 'devDependencies', 'peerDependencies'):
                packages.extend(data.get(group, {}).keys())
        elif name == 'requirements.txt':
            packages = [re.split(r'[<>=!~\[; ]', line.strip())[0].lower()
                        for line in content.splitlines() if line.strip() and not line.lstrip().startswith('#')]
        elif name == 'pyproject.toml':
            data = tomllib.loads(content)
            packages = [re.split(r'[<>=!~\[; ]', value)[0].lower()
                        for value in data.get('project', {}).get('dependencies', [])]
            packages.extend(data.get('tool', {}).get('poetry', {}).get('dependencies', {}).keys())
    except (ValueError, TypeError, AttributeError):
        return []
    mapping = {'fastapi': 'fastapi', 'react': 'react', 'next': 'nextjs'}
    return sorted({mapping[p] for p in packages if p in mapping})


class RuleSkillAnalyzer:
    version = 'rules-project-v0.1'
    provider = 'rule_based'
    model = None

    def analyze_project(self, data: ProjectAnalysisInput) -> ProjectAnalysisResult:
        evidence: list[EvidenceInput] = []

        def add(key: str, kind: str, status: str, strength: str, text: str,
                source: str, path: str | None, reason: str):
            match = re.search(ALIASES[key] if key != 'nextjs' else r'next', text, re.I)
            start = max(0, match.start() - 200) if match else 0
            evidence.append(EvidenceInput(skill_key=key, skill_label=LABELS[key],
                evidence_type=kind, evidence_status=status, evidence_strength=strength,
                source_url=source, path=path, excerpt=text[start:start + 4000], reason=reason,
                limitations=[AUTHOR_LIMIT, 'Kanıt gücü uzmanlık veya beceri seviyesi değildir.']))

        for key in mentioned(data.description):
            add(key, 'project_description', 'declared_only', 'weak', data.description,
                data.snapshot.repository_url, None, 'Proje açıklamasındaki beyan; kullanım doğrulanmadı.')
        for file in data.snapshot.files:
            path = PurePosixPath(file.path)
            if path.name.lower().startswith('readme'):
                for key in mentioned(file.content):
                    add(key, 'readme', 'declared_only', 'weak', file.content, file.source_url,
                        file.path, 'README beyanı; çalışır kod veya uzmanlık kanıtı değildir.')
            for key in dependency_skills(file.path, file.content):
                add(key, 'dependency_file', 'observed', 'medium', file.content, file.source_url,
                    file.path, 'Yapılandırılmış bağımlılık kaydı; gerçek çalışma veya uzmanlık doğrulanmadı.')
            if path.suffix == '.py':
                try:
                    tree = ast.parse(file.content)
                except SyntaxError:
                    continue
                if tree.body:
                    add('python', 'source_file', 'observed', 'strong', file.content,
                        file.source_url, file.path, 'Python AST olarak ayrıştırılabilen kaynak dosyası.')
                for node in ast.walk(tree):
                    modules = ([a.name for a in node.names] if isinstance(node, ast.Import)
                               else [node.module or ''] if isinstance(node, ast.ImportFrom) else [])
                    if any(m == 'fastapi' or m.startswith('fastapi.') for m in modules):
                        add('fastapi', 'source_file', 'observed', 'strong',
                            ast.get_source_segment(file.content, node) or '', file.source_url,
                            file.path, 'Kaynak kodunda FastAPI import ifadesi; çalışma zamanı doğrulanmadı.')
                        break
        for language in sorted(data.snapshot.languages):
            for key in mentioned(language):
                add(key, 'repository_language', 'observed', 'weak', language,
                    data.snapshot.repository_url, None, 'GitHub dil metadatası; kişisel katkı doğrulanmadı.')
        return ProjectAnalysisResult(skills=sorted({e.skill_key for e in evidence}), evidence=evidence,
            limitations=[AUTHOR_LIMIT, *data.snapshot.limitations],
            uncertainties=['Analiz sınırlı kurallara ve örneklenmiş dosyalara dayanır; kanıt yokluğu beceri yokluğu değildir.'],
            analysis_version=self.version)


class RuleNeedAnalyzer:
    version = 'rules-need-v0.3'
    provider = 'rule_based'
    model = None

    def analyze_need(self, data: NeedAnalysisInput) -> NeedAnalysisResult:
        criteria: dict[str, CriterionInput] = {}
        text = '\n'.join(filter(None, [data.description, data.target_role, data.expected_output]))
        for clause in re.split(r'[;\n!?]|(?<!\w)\.(?!\w)', text):
            if re.search(r'gerekmiyor|gerekmez|istemiyoruz|not required|do not need', clause, re.I):
                continue
            preferred = bool(re.search(r'tercih|opsiyonel|preferred|optional|nice.to.have', clause, re.I))
            for key in mentioned(clause):
                priority = 'preferred' if preferred else 'required'
                if key not in criteria or priority == 'required':
                    criteria[key] = CriterionInput(skill_key=key, skill_label=LABELS[key], priority=priority)
        for key, priority in explicit_profile_criteria(text).items():
            family, label, _ = CATALOG[key]
            criteria[key] = CriterionInput(kind=family, skill_key=key, skill_label=label, priority=priority,
                reason='İhtiyaçta açıkça belirtilen deneyim; yetkinlik veya kişilik çıkarımı yapılmadı.')
        return NeedAnalysisResult(criteria=[criteria[k] for k in sorted(criteria)],
            uncertainties=['Sınırlı anahtar kelime analizi; priority cümlecik bazında belirlenir. Kesin öncelikler için açık criteria gönderin.'],
            analysis_version=self.version)

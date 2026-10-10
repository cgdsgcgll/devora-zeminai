"""C/C++ material passes existing bounded fetch and unchanged grounding rules."""
import base64
from uuid import uuid4

import httpx
import pytest

from app.core.errors import AppError
from app.schemas.domain import ProjectAnalysisInput
from app.services.analysis.context import project_context
from app.services.analysis.llm_analyzers import ProjectSkillAnalyzer
from app.services.github.provider import GitHubProvider, MAX_FILE_BYTES, MAX_FILES, MAX_TOTAL_BYTES
from test_github import mock_transport
from test_llm import FakeProvider, evidence_draft

EXTENSIONS = ('.c', '.cc', '.cpp', '.cxx', '.h', '.hh', '.hpp', '.hxx')
IMPLEMENTATION = b'namespace cpp { int add(int a, int b) { return a + b; } }'


def fetch(entries, payloads):
    calls=[]
    def handle(request):
        assert request.url.host=='api.github.com'
        path=request.url.path
        if '/git/trees/' in path:
            return httpx.Response(200,json={'tree':entries})
        if '/git/blobs/' in path:
            sha=path.rsplit('/',1)[-1];calls.append(sha)
            return httpx.Response(200,json={'encoding':'base64','content':base64.b64encode(payloads[sha]).decode()})
        if path.endswith('/languages'):
            return httpx.Response(200,json={'C++':100})
        return mock_transport().handle_request(request)
    snapshot=GitHubProvider(transport=httpx.MockTransport(handle)).fetch('https://github.com/test/repo')
    return snapshot,calls


def entry(path,sha='source',size=len(IMPLEMENTATION),mode='100644'):
    return {'path':path,'sha':sha,'size':size,'mode':mode,'type':'blob'}


def data(snapshot):
    return ProjectAnalysisInput(candidate_id=uuid4(),project_id=uuid4(),name='C++ sample',description='',snapshot=snapshot)


@pytest.mark.parametrize('extension',EXTENSIONS)
def test_c_cpp_extensions_reach_bounded_analyzer_source_context(extension):
    snapshot,calls=fetch([entry('src/implementation'+extension)],{'source':IMPLEMENTATION})
    assert calls==['source']
    context=project_context(data(snapshot),24000)
    assert len(context['files'])==1
    assert context['files'][0]=={'path':'src/implementation'+extension,'kind':'source_file','excerpt':IMPLEMENTATION.decode()}
    assert '/blob/'+'a'*40+'/' in snapshot.files[0].source_url


def test_cpp_binary_oversize_generated_vendor_archives_and_links_are_excluded():
    entries=[entry('good.cpp','good'),entry('include/good.hpp','header'),entry('include/good.h','header2'),
        entry('binary.cpp','binary'),entry('invalid-utf8.h','invalid'),
        entry('large.cpp','large',MAX_FILE_BYTES+1),entry('lying-size.cpp','lying',1),
        entry('vendor/lib.cpp','vendor'),entry('build/output.cpp','build'),
        entry('generated/output.hpp','generated'),entry('CMakeFiles/compiler.cpp','cmake'),
        entry('archive.zip','zip'),entry('link.cpp','symlink',mode='120000'),
        entry('module.cpp','submodule',mode='160000')]
    snapshot,calls=fetch(entries,{'good':IMPLEMENTATION,'header':b'int add(int a, int b);',
        'header2':b'int subtract(int a, int b);','binary':b'\x00binary',
        'invalid':b'\xff\xfe','lying':b'x'*(MAX_FILE_BYTES+1)})
    assert sorted(f.path for f in snapshot.files)==['good.cpp','include/good.h','include/good.hpp']
    assert not set(calls)&{'large','vendor','build','generated','cmake','zip','symlink','submodule'}


@pytest.mark.parametrize('size',[len(IMPLEMENTATION),MAX_FILE_BYTES])
def test_cpp_file_count_and_total_bytes_stay_bounded(size):
    entries=[entry(f'src/{i:02}.cpp',str(i),size) for i in range(50)]
    snapshot,calls=fetch(entries,{str(i):b'x'*size for i in range(50)})
    assert len(calls)==MAX_FILES
    assert len(snapshot.files)==min(MAX_FILES,MAX_TOTAL_BYTES//size)
    assert sum(len(f.content.encode()) for f in snapshot.files)<=MAX_TOTAL_BYTES


def test_cpp_actual_content_can_ground_observed_without_new_language_inference():
    snapshot,_=fetch([entry('src/add.cpp')],{'source':IMPLEMENTATION})
    draft=evidence_draft(skill_key='cpp',skill_label='C++',path='src/add.cpp',excerpt=IMPLEMENTATION.decode())
    result=ProjectSkillAnalyzer(FakeProvider(draft)).analyze_project(data(snapshot))
    assert len(result.evidence)==1
    evidence=result.evidence[0]
    assert (evidence.skill_key,evidence.evidence_type,evidence.evidence_status)==('cpp','source_file','observed')
    assert evidence.excerpt==IMPLEMENTATION.decode()
    assert evidence.source_url.endswith('/src/add.cpp')
    # File extension/name alone does not add a new C++ shortcut to grounding.
    bare=b'int add(int a, int b) { return a+b; }'
    snapshot,_=fetch([entry('src/add.cpp')],{'source':bare})
    draft['evidence'][0]['excerpt']=bare.decode()
    with pytest.raises(AppError) as error:
        ProjectSkillAnalyzer(FakeProvider(draft)).analyze_project(data(snapshot))
    assert error.value.code=='INVALID_MODEL_OUTPUT'


def test_readme_cpp_mention_remains_declared_and_cannot_impersonate_source():
    snapshot,_=fetch([entry('README.md')],{'source':b'Built with C++'})
    draft=evidence_draft(skill_key='cpp',skill_label='C++',path='README.md',
        excerpt='Built with C++',evidence_type='readme',evidence_status='observed')
    result=ProjectSkillAnalyzer(FakeProvider(draft)).analyze_project(data(snapshot))
    assert result.evidence[0].evidence_status=='declared_only'
    assert result.evidence[0].evidence_strength=='weak'
    draft['evidence'][0].update(evidence_type='source_file')
    with pytest.raises(AppError):
        ProjectSkillAnalyzer(FakeProvider(draft)).analyze_project(data(snapshot))
    # Language metadata cannot impersonate an implementation that was not fetched.
    draft['evidence'][0].update(path='missing.cpp',excerpt='C++')
    with pytest.raises(AppError):
        ProjectSkillAnalyzer(FakeProvider(draft)).analyze_project(data(snapshot))


@pytest.mark.parametrize('kind,path,quote', [
    ('repository_language', None, 'C++'), ('readme', 'README.md', 'Built with C++')])
def test_cpp_metadata_and_readme_never_observed_or_match(kind, path, quote):
    from app.schemas.domain import SkillEvidence
    from app.services.matching.scorer import calculate_match
    from test_matching import criterion
    snapshot, _ = fetch([entry('README.md')], {'source': b'Built with C++'})
    draft = evidence_draft(skill_key='cpp', skill_label='C++', evidence_type=kind,
                           path=path, excerpt=quote, evidence_status='observed')
    result = ProjectSkillAnalyzer(FakeProvider(draft)).analyze_project(data(snapshot))
    item = result.evidence[0]
    assert (item.evidence_status, item.evidence_strength) == ('declared_only', 'weak')
    stored = SkillEvidence(**item.model_dump(), candidate_id=uuid4(), project_id=uuid4(),
                          snapshot_id=uuid4(), analysis_run_id=uuid4())
    assert calculate_match([criterion('cpp')], [stored], 'test').score == 0
    # Legacy erroneous observed classification cannot bypass current matching either.
    assert calculate_match([criterion('cpp')], [stored.model_copy(update={'evidence_status': 'observed'})], 'test').score == 0


@pytest.mark.parametrize('extension', ['.cpp', '.h', '.hpp'])
def test_cpp_implementation_grounding_matches_with_exact_source_provenance(extension):
    from app.schemas.domain import SkillEvidence
    from app.services.matching.scorer import calculate_match
    from test_matching import criterion
    implementation = b'class Complex { private: double real; public: double value() { return real; } };'
    path = 'src/complex' + extension
    snapshot, _ = fetch([entry(path)], {'source': implementation})
    draft = evidence_draft(skill_key='cpp', skill_label='C++', path=path, excerpt=implementation.decode())
    item = ProjectSkillAnalyzer(FakeProvider(draft)).analyze_project(data(snapshot)).evidence[0]
    assert (item.evidence_type, item.evidence_status, item.path, item.excerpt) == ('source_file', 'observed', path, implementation.decode())
    stored = SkillEvidence(**item.model_dump(), candidate_id=uuid4(), project_id=uuid4(),
                          snapshot_id=uuid4(), analysis_run_id=uuid4())
    assert calculate_match([criterion('cpp')], [stored], 'test').score == 100


@pytest.mark.parametrize('content', ['// C++ using namespace std;', '/* class X { public: */',
    'const char* text = "using namespace std;";', 'C++', 'int add(int a, int b) { return a+b; }'])
def test_cpp_filename_comments_and_literals_are_not_source_grounding(content):
    snapshot, _ = fetch([entry('cpp.cpp')], {'source': content.encode()})
    draft = evidence_draft(skill_key='cpp', skill_label='C++', path='cpp.cpp', excerpt=content)
    with pytest.raises(AppError):
        ProjectSkillAnalyzer(FakeProvider(draft)).analyze_project(data(snapshot))


def test_rule_language_metadata_cannot_be_observed():
    from app.services.analysis.rules import RuleSkillAnalyzer
    snapshot, _ = fetch([], {})
    snapshot.languages = {'C++': 100, 'Python': 100}
    result = RuleSkillAnalyzer().analyze_project(data(snapshot))
    assert result.evidence
    assert all(e.evidence_status != 'observed' for e in result.evidence)

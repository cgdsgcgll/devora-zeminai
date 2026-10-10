from uuid import UUID
import pytest
from sqlalchemy import select, func
from app.models import domain as m
from test_auth import accounts

URL='https://www.linkedin.com/in/example-person'
TEXT='work | Designer | Example | Intern | 2024-01-01 | 2024-06-01\nPython mentioned in description\n\ncertification | Design certificate | Example'


@pytest.mark.parametrize('url',['http://linkedin.com/in/test','https://evil-linkedin.com/in/test','https://linkedin.com.evil.test/in/test','https://linkedin.com/company/test','https://user@linkedin.com/in/test','https://linkedin.com/in/test?next=evil','https://127.0.0.1/in/test','https://linkedin.com/in/a/../b'])
def test_professional_invalid_url(accounts,url):
    client,state=accounts()
    assert client.post('/candidates/'+state['candidate']['id']+'/professional-preview',json={'source_url':url}).status_code==422


def test_professional_preview_confirm_provenance_no_fetch(accounts,db,monkeypatch):
    import httpx
    original_send=httpx.Client.send
    def no_fetch(client,request,**kwargs):
        assert request.url.host=='testserver', 'Professional imports must not fetch external URLs'
        return original_send(client,request,**kwargs)
    monkeypatch.setattr(httpx.Client,'send',no_fetch)
    # TestClient overrides send, so local API requests still work.
    client,state=accounts();other,_=accounts();institution,_=accounts('institution')
    path='/candidates/'+state['candidate']['id']
    data={'source_url':URL,'text':TEXT}
    for who,code in [(other,404),(institution,403)]:
        assert who.post(path+'/professional-preview',json=data).status_code==code
        assert who.post(path+'/professional-import',json={**data,'confirmed':True,'selected':[0]}).status_code==code
    assert client.post(path+'/professional-preview',json=data,headers={'Origin':'https://evil.test'}).status_code==403
    preview=client.post(path+'/professional-preview',json=data)
    assert preview.status_code==200,preview.text
    rows=preview.json()['records'];assert len(rows)==2
    assert rows[0]['organization']=='Example' and rows[0]['role']=='Intern'
    assert rows[1]['started_at'] is None
    assert db.scalar(select(func.count()).select_from(m.ProfileEvidenceItem))==0
    assert client.post(path+'/professional-import',json={**data,'selected':[0]}).status_code==422
    result=client.post(path+'/professional-import',json={**data,'confirmed':True,'selected':[0,1]})
    assert result.status_code==201,result.text
    assert all(r['verification_status']=='declared_only' for r in result.json())
    record=result.json()[0]
    assert record['metadata_json']['source_type']=='linkedin_profile'
    assert record['metadata_json']['imported_at']
    edited=client.patch('/profile-evidence/'+record['id'],json={'metadata_json':{},'title':'Updated'})
    assert edited.json()['verification_status']=='declared_only'
    # Existing deterministic profile families can match; technical mentions cannot.
    need=institution.post('/needs',json={'description':'Test','criteria':[
        {'skill_key':'python','skill_label':'Python','priority':'required'},
        {'kind':'certification','skill_key':'certification_experience','skill_label':'Certificate','priority':'preferred'},
        {'kind':'project_experience','skill_key':'project_experience','skill_label':'Project','priority':'preferred'}]}).json()
    match=institution.post('/matches',json={'candidate_id':state['candidate']['id'],'need_id':need['id']}).json()
    assert {r['skill_key'] for r in match['matched_criteria']}=={'certification_experience'}
    assert db.scalar(select(func.count()).select_from(m.SkillEvidence))==0


def test_url_only_linked_and_free_text_no_inference(accounts):
    client,state=accounts();path='/candidates/'+state['candidate']['id']
    reference=client.post(path+'/professional-import',json={'source_url':URL,'confirmed':True,'selected':[0]}).json()[0]
    assert reference['verification_status']=='linked'
    preview=client.post(path+'/professional-preview',json={'source_url':URL,'text':'Python professional\nTeam leadership'}).json()['records'][0]
    assert not preview['organization'] and preview['started_at'] is None and not preview['role']
    assert preview['description']=='Python professional\nTeam leadership'


@pytest.mark.parametrize('text',['work | Title | Org | Role | 2025-01-01 | 2024-01-01','work | Title | Org | Role | yesterday','unknown | title', '\n\n'.join(['record']*21)])
def test_bounded_parser_rejects_invalid_records(accounts,text):
    client,state=accounts()
    result=client.post('/candidates/'+state['candidate']['id']+'/professional-preview',json={'source_url':URL,'text':text})
    assert result.status_code==422

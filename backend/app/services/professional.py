"""Bounded explicit-field parser. No network, inference, raw-upload storage or AI claims."""
from datetime import date
from app.core.errors import AppError
from app.schemas.profile import ProfessionalInput, ProfileEvidenceCreate, ProfileMetadata
from app.schemas.domain import utcnow

KINDS = {'education':'education', 'certification':'certification', 'project':'portfolio',
         'work':'portfolio', 'internship':'portfolio', 'community':'community',
         'volunteering':'community', 'event':'event', 'hackathon':'hackathon'}


def preview(data: ProfessionalInput):
    blocks = [b.strip() for b in data.text.split('\n\n') if b.strip()]
    if len(blocks)>20:
        raise AppError('IMPORT_LIMIT_EXCEEDED','En fazla 20 kayıt içe aktarılabilir.',422)
    if not blocks:
        return [ProfileEvidenceCreate(category='portfolio',title='LinkedIn',source_url=data.source_url,
            source_label='Candidate-provided LinkedIn profile reference',
            metadata_json=ProfileMetadata(source_type='linkedin_profile',import_method='url',record_kind='profile'))]
    rows=[]
    for block in blocks:
        lines=block.splitlines()
        fields=[f.strip() for f in lines[0].split('|')]
        kind=fields[0].lower()
        if len(fields)>1:
            if kind not in KINDS or not 2<=len(fields)<=6 or not fields[1]:
                raise AppError('PROFILE_IMPORT_FORMAT','Beklenen: kind | title | organization | role | YYYY-MM-DD | YYYY-MM-DD',422)
            fields += ['']*(6-len(fields))
            try:
                start,end=(date.fromisoformat(v) if v else None for v in fields[4:6])
            except ValueError:
                raise AppError('PROFILE_IMPORT_FORMAT','Tarih YYYY-MM-DD olmalı; bilinmeyen tarihi boş bırakın.',422) from None
            title,org,role=fields[1:4]
            description='\n'.join(lines[1:])
        else:
            kind='project';title=lines[0][:200];org=role='';start=end=None
            description=block # Unstructured text stays verbatim, without invented structured fields.
        try:
            rows.append(ProfileEvidenceCreate(category=KINDS[kind],title=title,organization=org,role=role,
                started_at=start,ended_at=end,description=description,source_url=data.source_url,
                source_label='Candidate-provided LinkedIn export/profile text',
                metadata_json=ProfileMetadata(source_type='linkedin_profile',import_method='pasted_text',
                    record_kind=kind if kind in ('work','internship','project') else None)))
        except ValueError:
            raise AppError('PROFILE_IMPORT_FORMAT','Kayıt alanları veya tarih sırası geçersiz.',422) from None
    return rows

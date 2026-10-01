"""Bounded nontechnical criteria. Unsupported requests stay uncertain, never become bonuses."""
import re
from typing import Literal

CriterionKind = Literal['technical_skill', 'project_experience', 'education', 'certification', 'hackathon', 'community', 'event']
TECHNICAL_KEYS = frozenset('python fastapi postgresql react nextjs docker docker-compose javascript typescript java kotlin swift go rust cpp csharp sql mysql sqlite redis mongodb aws azure kubernetes git linux django flask spring nodejs express tensorflow pytorch torch transformers openai'.split())

# Canonical key -> family, display label, explicit request expression.
CATALOG = {
    'project_experience': ('project_experience', 'Proje deneyimi', r'proje deneyimi|project experience'),
    'ai_project_experience': ('project_experience', 'Yapay zekâ proje deneyimi', r'(?:yapay zek[aâ]|AI|artificial intelligence) proj(?:e|ect)'),
    'education_student': ('education', 'Devam eden öğrencilik', r'öğrenci(?:si)? ol|currently a student'),
    'education_year_3_4': ('education', '3. veya 4. sınıf öğrencisi', r'3\.?\s*(?:veya|ya da|or)\s*4\.?\s*sınıf'),
    'certification_experience': ('certification', 'Sertifika kaydı', r'genel sertifika kaydı|certification experience'),
    'hackathon_experience': ('hackathon', 'Hackathon deneyimi', r'hackathon deneyimi|hackathon experience|hackathon.+katıl'),
    'hackathon_finalist': ('hackathon', 'Hackathon finalistliği', r'hackathon.{0,25}finalist'),
    'hackathon_winner': ('hackathon', 'Hackathon birinciliği', r'hackathon.{0,25}(?:kazanan|birinci|winner)'),
    'community_experience': ('community', 'Topluluk deneyimi', r'topluluk(?:larında|ta|larda|ta)? (?:aktif|deneyimi|katkı)|community experience'),
    'community_organizer': ('community', 'Topluluk organizatörlüğü', r'topluluk.{0,20}organizatör|community organizer'),
    'event_experience': ('event', 'Etkinlik katılımı', r'etkinlik (?:deneyimi|katılımı)|event participation'),
    'event_speaker': ('event', 'Etkinlik konuşmacılığı', r'etkinlik.{0,20}konuşmacı|event speaker'),
}


def requested(key: str, text: str) -> bool:
    return key in CATALOG and bool(re.search(CATALOG[key][2], text, re.I))


def explicit_profile_criteria(text: str):
    result = {}
    for clause in re.split(r'[;\n!?]|,(?!\d)', text):
        if re.search(r'gerekmiyor|gerekmez|istemiyoruz|not required|do not need', clause, re.I):
            continue
        keys = [key for key in CATALOG if requested(key, clause)]
        for broad, specific in [('hackathon_experience', ['hackathon_finalist', 'hackathon_winner']),
                                ('community_experience', ['community_organizer']),
                                ('event_experience', ['event_speaker']),
                                ('education_student', ['education_year_3_4'])]:
            if broad in keys and any(key in keys for key in specific):
                keys.remove(broad)
        preferred = bool(re.search(r'tercih|opsiyonel|preferred|optional', clause, re.I))
        required = bool(re.search(r'gerekli|zorunlu|required|must', clause, re.I))
        for key in keys:
            priority = 'required' if required and not preferred else 'preferred'
            if key not in result or priority == 'required':
                result[key] = priority
    return result

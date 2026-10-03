import type { ProfileEvidence } from "@/lib/api/client";
type Category = ProfileEvidence["category"];
const choices: [Category, string, string, string][] = [
  [
    "education",
    "Eğitim",
    "Okul, kurs veya program",
    "M3 9l9-5 9 5-9 5-9-5m4 3v5c3 3 7 3 10 0v-5M21 9v8",
  ],
  [
    "certification",
    "Sertifika",
    "Öğrenmenizin belgesi",
    "M6 3h12v13H6zM9 16v5l3-2 3 2v-5M9 7h6M9 11h4",
  ],
  [
    "hackathon",
    "Hackathon",
    "Birlikte ürettiğiniz projeler",
    "M8 4h8v5a4 4 0 01-8 0V4zm0 2H4v2a4 4 0 004 4m8-6h4v2a4 4 0 01-4 4M12 13v7M8 20h8",
  ],
  [
    "event",
    "Etkinlik",
    "Katıldığınız buluşmalar",
    "M5 5h14v15H5zM8 3v4M16 3v4M5 10h14M8 14h3M13 14h3",
  ],
  [
    "community",
    "Topluluk",
    "Katkılarınız ve sorumluluklarınız",
    "M9 11a3 3 0 100-6 3 3 0 000 6m6 0a3 3 0 100-6M3 20v-2a6 6 0 0112 0v2m3 0v-2a7 7 0 00-2-5",
  ],
  [
    "portfolio",
    "Portföy",
    "Yayınladığınız çalışmalar",
    "M3 7h18v13H3zM8 7V4h8v3M3 12h18M10 12v3h4v-3",
  ],
];
export function ExperienceChooser({
  disabled,
  onChoose,
}: {
  disabled: boolean;
  onChoose: (category: Category) => void;
}) {
  return (
    <fieldset className="category-picker" disabled={disabled}>
      <legend>Hikâyenize ne eklemek istersiniz?</legend>
      {choices.map(([key, title, description, path]) => (
        <button type="button" key={key} onClick={() => onChoose(key)}>
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d={path} />
          </svg>
          <strong>{title}</strong>
          <span>{description}</span>
          <span className="category-arrow" aria-hidden="true">
            →
          </span>
        </button>
      ))}
    </fieldset>
  );
}

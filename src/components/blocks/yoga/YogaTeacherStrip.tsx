import Link from "next/link";
import Image from "next/image";
import { teacherPhotoSrc } from "@/lib/yoga";
import type { SanityYogaTeacher } from "../../../../sanity/lib/fetch";

interface Props {
  teachers: SanityYogaTeacher[];
}

/**
 * Docentenstrip op de yoga-hub. Toont alleen docenten die live mogen
 * (`isActive`), dus een nog te bevestigen docent verschijnt hier niet.
 * Linkt naar de docent-detailpagina (PR-Y3).
 */
export function YogaTeacherStrip({ teachers }: Props) {
  const active = teachers.filter((t) => t.isActive);
  if (!active.length) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
      {active.map((teacher) => {
        const src = teacherPhotoSrc(teacher);
        return (
          <Link
            key={teacher._id}
            href={`/yoga/docenten/${teacher.slug}`}
            className="group block"
          >
            <div className="relative aspect-[4/5] bg-bg-subtle overflow-hidden mb-4">
              {src ? (
                <Image
                  src={src}
                  alt={`${teacher.name}, yogadocent bij The Movement Club in Loosdrecht`}
                  fill
                  sizes="(max-width: 768px) 50vw, 25vw"
                  className="object-cover transition-transform duration-700 ease-[cubic-bezier(0.2,0.7,0.1,1)] group-hover:scale-[1.03]"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="tmc-eyebrow text-text-muted">
                    {teacher.name}
                  </span>
                </div>
              )}
            </div>
            <h3 className="text-text font-medium group-hover:text-accent transition-colors">
              {teacher.name}
            </h3>
            {teacher.specialty && (
              <p className="text-text-muted text-sm mt-1">{teacher.specialty}</p>
            )}
          </Link>
        );
      })}
    </div>
  );
}

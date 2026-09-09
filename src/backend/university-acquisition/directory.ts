import { freezeUniversityValue, type UniversityCandidate } from './types.js';

export const EXTERNAL_COURSE_DIRECTORY: readonly UniversityCandidate[] =
  freezeUniversityValue([
    {
      id: 'univ_mit_6100l',
      sourceId: 'univ_mit_6100l',
      title: 'Introduction to CS and Programming using Python',
      kind: 'course',
      institution: 'Massachusetts Institute of Technology',
      courseCode: '6.100L',
      originalUrl:
        'https://ocw.mit.edu/courses/6-100l-introduction-to-cs-and-programming-using-python-fall-2022/',
      acquisitionUrl: null,
      licenseEvidenceUrl: 'https://ocw.mit.edu/pages/privacy-and-terms-of-use/',
      format: 'external-reading',
      topicTags: ['python', 'computer-science'],
      reachability: 'unchecked',
      permission: 'directory-only',
      extraction: 'none',
      indexing: 'not-indexed',
      publicNotes: [
        'Factual directory entry only: title, institution, course code, URL, and tags.',
        'General MIT OCW is not a blanket indexing permission. The independently licensed Computational Thinking repository is a separate full-text route.',
      ],
    },
    {
      id: 'univ_yale_phys200',
      sourceId: 'univ_yale_phys200',
      title: 'Fundamentals of Physics I',
      kind: 'course',
      institution: 'Yale University',
      courseCode: 'PHYS 200',
      originalUrl: 'https://oyc.yale.edu/physics/phys-200',
      acquisitionUrl: null,
      licenseEvidenceUrl: 'https://oyc.yale.edu/terms',
      format: 'external-reading',
      topicTags: ['physics', 'mechanics'],
      reachability: 'unchecked',
      permission: 'directory-only',
      extraction: 'none',
      indexing: 'not-indexed',
      publicNotes: [
        'Factual directory entry only. Open Yale Courses terms identify commercial tutor reuse as restricted.',
        'Recommended commercial textbooks on the course page are not licensed course assets.',
      ],
    },
    {
      id: 'univ_cmu_oli_psych',
      sourceId: 'univ_cmu_oli_psych',
      title: 'Introduction to Psychology — Open & Free',
      kind: 'course',
      institution: 'Carnegie Mellon University',
      courseCode: 'OLI Introduction to Psychology',
      originalUrl:
        'https://oli.cmu.edu/courses/introduction-to-psychology-open-free/',
      acquisitionUrl: null,
      licenseEvidenceUrl:
        'https://oli.cmu.edu/about/policies/oli-terms-and-conditions/',
      format: 'external-reading',
      topicTags: ['psychology'],
      reachability: 'unchecked',
      permission: 'directory-only',
      extraction: 'none',
      indexing: 'not-indexed',
      publicNotes: [
        'Factual directory entry only. Open-and-free learner access is not a content-license transfer.',
        'Torus software being MIT-licensed does not license this course text.',
      ],
    },
  ]);

export function externalCourseEntry(
  candidateId: string,
): UniversityCandidate | null {
  return (
    EXTERNAL_COURSE_DIRECTORY.find((entry) => entry.id === candidateId) ?? null
  );
}

// =============================================================================
// public/src/features/home/user-quizzes-folders.js  (SLIM VERSION)
// The original file is a ~1,750-line UI module (folder tree rendering, drag &
// drop, dialogs) that statically imports most of the quiz app. The AI agent
// only needs the helpers below, so they are copied here VERBATIM (no logic
// changes) to keep quiz-schema.js / lesson-schema.js /
// ai-agent-item-lookup.js working without dragging the whole app along.
// =============================================================================

/**
 * Walks a row's full parentId chain up to a root (parentId === null) and
 * returns true only if every ancestor along the way actually exists in
 * `userQuizzes`. A row one level below a missing parent is caught by a
 * simple "does my direct parent exist" check, but a row whose *grandparent*
 * is missing (its direct parent still exists as a row, but that parent's
 * own parent doesn't) would incorrectly pass a one-level check — this walks
 * the whole chain, the same way isDescendant() below already does for the
 * unrelated "am I inside myself" check, so both share the same notion of
 * what "reachable from root" means.
 *
 * Used by:
 *  - pruneOrphanedRows() (course-count.js) — so the "امتحاناتك" card's
 *    counts only include genuinely reachable rows.
 *  - hasSameLevelCollision() below — so a same-name/type/level clash
 *    against a row that's technically still in storage but unreachable
 *    (a leftover from an old bug, or one being cleaned up) doesn't block a
 *    legitimate new copy/create/rename/move.
 *
 * @param {object} row - a user_quizzes entry
 * @param {Array} userQuizzes
 * @param {Map<string, object>} [byId] - optional id→row lookup to reuse
 *   across many calls in the same pass instead of re-scanning the array
 *   each time (collision checks and bulk operations call this per-row).
 * @returns {boolean}
 */
export function isRowReachable(row, userQuizzes, byId = null) {
  const lookup =
    byId ||
    new Map(
      userQuizzes.map((q) => [q.id || q.meta?.id, q]).filter(([id]) => id),
    );
  const seen = new Set();
  let current = row;
  while (current) {
    const parentId = current.meta?.parentId || null;
    if (parentId === null) return true;
    if (seen.has(parentId)) return false; // cyclic parentId — treat as unreachable, not an infinite loop
    seen.add(parentId);
    current = lookup.get(parentId);
    if (!current) return false;
  }
  return true;
}

/**
 * The one rule the whole "امتحاناتك" section must follow, enforced
 * identically everywhere a new name can be introduced at a level: create
 * (createFolderOrCourseNamed), rename (renameItem), move
 * (moveItemsToFolder), single-quiz copy (copyQuizToUserQuizzes), and
 * tree copy (copyCategoryTreeToUserQuizzes's copyNode, every node type).
 *
 * "No two elements of the same type AND same name may share the same
 * parentId." Different levels are always allowed regardless of name reuse;
 * different types at the same level with the same name are always allowed
 * too (a folder and a course can both be named "math" side by side) — and
 * by the same rule a lesson and a quiz may share a name at one level.
 *
 * `type` is compared as an opaque string against each row's
 * `meta.type` (defaulting to "quiz" for plain quiz rows that carry none),
 * so the recognized set — "quiz" | "lesson" | "folder" | "course" — grows
 * additively: "lesson" needed no signature or logic change here. Every
 * existing call site passes its own explicit type ("quiz", or a variable
 * already carrying the row's own type), so none of them can accidentally
 * match a lesson row.
 *
 * Unreachable/orphaned rows (see isRowReachable above) never count as a
 * collision — a leftover row from an old bug shouldn't block a legitimate
 * new item from taking that name.
 *
 * @param {Array} userQuizzes - checked as given, so a caller that has
 *   already `.push()`-ed newly copied siblings earlier in the same pass
 *   (copyCategoryTreeToUserQuizzes copying two subtrees in one call) gets
 *   those included automatically — pass the same live array reference
 *   you're building, not a stale snapshot.
 * @param {{type: "quiz"|"lesson"|"folder"|"course", title: string, parentId: string|null, excludeId?: string}} candidate
 * @returns {boolean} true if placing `candidate` would collide
 */
export function hasSameLevelCollision(userQuizzes, { type, title, parentId, excludeId = null }) {
  const normalizedTitle = (title || "").trim().toLowerCase();
  const normalizedParentId = parentId || null;
  const byId = new Map(
    userQuizzes.map((q) => [q.id || q.meta?.id, q]).filter(([id]) => id),
  );
  return userQuizzes.some((q) => {
    const qId = q.id || q.meta?.id;
    if (excludeId && qId === excludeId) return false;
    const qType = q.meta?.type || "quiz"; // plain quiz rows carry no meta.type
    if (qType !== (type || "quiz")) return false;
    if ((q.meta?.parentId || null) !== normalizedParentId) return false;
    if ((q.meta?.title || "").trim().toLowerCase() !== normalizedTitle) return false;
    return isRowReachable(q, userQuizzes, byId);
  });
}

/**
 * Recursively count all subfolders and quizzes inside a given folder or course.
 * @param {object[]} userQuizzes
 * @param {string} folderId
 * @returns {{ subfolderCount: number, quizCount: number }}
 */
export function getFolderContentsCount(userQuizzes, folderId) {
  let subfolderCount = 0;
  let quizCount = 0;
  let lessonCount = 0;

  function walk(currentId) {
    const children = userQuizzes.filter(
      (q) =>
        (q.meta?.parentId || null) === currentId &&
        // Drafts are never shown in the tree (see getChildren), so they must
        // not be counted either.
        q.meta?.type !== "draft" &&
        q.meta?.type !== "draft-lesson",
    );
    for (const child of children) {
      const type = child.meta?.type;
      if (type === "folder" || type === "course") {
        subfolderCount++;
        walk(child.id || child.meta?.id);
      } else if (type === "lesson") {
        // Lessons used to fall into the `else` below and be reported as
        // quizzes ("3 امتحانات" for a folder holding 1 quiz + 2 lessons).
        lessonCount++;
      } else {
        quizCount++;
      }
    }
  }

  walk(folderId);
  return { subfolderCount, quizCount, lessonCount };
}

import { useCallback, useEffect, useRef, useState } from "react";
import { EyeOff, MessageSquare, Pencil, Star, Trash2 } from "lucide-react";
import { reviewApi } from "../../frontApi";
import { useToast } from "../../context/useToast";
import ConfirmDialog from "../ui/ConfirmDialog";
import { StarDisplay, StarInput } from "./Stars";
import { formatDate } from "../../utils/date";
import { getInitials } from "../../utils/property";

const PAGE_SIZE = 10;
const TITLE_MAX = 100;
const COMMENT_MAX = 2000;
const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "highest", label: "Highest rated" },
  { value: "lowest", label: "Lowest rated" },
];
const EMPTY_SUMMARY = { average: null, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
const ratingWord = (count) => `${count} ${count === 1 ? "rating" : "ratings"}`;

// ---------- Average, count and how the stars are spread
const Summary = ({ summary }) => (
  <div>
    <div className="flex items-center gap-2">
      <p className="text-4xl font-bold tracking-tight text-gray-900 tabular-nums">{summary.count ? summary.average.toFixed(1) : "–"}</p>
      <Star aria-hidden="true" className={`h-7 w-7 ${summary.count ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
    </div>
    <p className="mt-1 text-sm text-gray-500">{summary.count ? ratingWord(summary.count) : "No ratings yet"}</p>
    <ul className="mt-4 space-y-1.5" aria-label="Rating breakdown">
      {[5, 4, 3, 2, 1].map((n) => {
        const share = summary.count ? (summary.distribution[n] / summary.count) * 100 : 0;
        return (
          <li key={n} className="flex items-center gap-2 text-xs text-gray-500">
            <span className="flex w-6 items-center justify-end gap-0.5 tabular-nums">{n}<Star aria-hidden="true" className="h-3 w-3 fill-amber-400 text-amber-400" /></span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
              <span className="block h-full rounded-full bg-brand-600 transition-[width] duration-500" style={{ width: `${share}%` }} />
            </span>
            <span className="w-6 text-right tabular-nums">{summary.distribution[n]}</span>
          </li>
        );
      })}
    </ul>
  </div>
);

// ---------- Write or edit (customers)
const ReviewForm = ({ initial, saving, error, onSubmit, onCancel }) => {
  const [rating, setRating] = useState(initial.rating || 0);
  const [title, setTitle] = useState(initial.title || "");
  const [comment, setComment] = useState(initial.comment || "");
  const [localError, setLocalError] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return setLocalError("Choose a rating from 1 to 5 stars.");
    if (title.trim().length > TITLE_MAX) return setLocalError(`Keep the title under ${TITLE_MAX} characters.`);
    if (comment.trim().length > COMMENT_MAX) return setLocalError(`Keep the review under ${COMMENT_MAX.toLocaleString()} characters.`);
    setLocalError("");
    onSubmit({ rating, title: title.trim(), comment: comment.trim() });
  };

  const message = localError || error;
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <p className="mb-1.5 text-sm font-medium text-gray-900">Your rating</p>
        <StarInput value={rating} onChange={(n) => { setRating(n); setLocalError(""); }} />
      </div>
      <div>
        <label htmlFor="review-title" className="mb-1.5 block text-sm font-medium text-gray-900">Title <span className="font-normal text-gray-400">(optional)</span></label>
        <input id="review-title" value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} placeholder="Sum up your experience" className="field" />
      </div>
      <div>
        <label htmlFor="review-comment" className="mb-1.5 block text-sm font-medium text-gray-900">Review <span className="font-normal text-gray-400">(optional)</span></label>
        <textarea id="review-comment" value={comment} maxLength={COMMENT_MAX} onChange={(e) => setComment(e.target.value)} rows={4} placeholder="What did you like? What should others know about this property?" className="field resize-y" />
        <p className="mt-1 text-right text-xs text-gray-400 tabular-nums">{comment.length.toLocaleString()} / {COMMENT_MAX.toLocaleString()}</p>
      </div>
      {message && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className="btn btn-primary px-5 py-2.5">{saving ? "Saving..." : initial.id ? "Update review" : "Submit review"}</button>
        <button type="button" onClick={onCancel} disabled={saving} className="btn btn-light px-5 py-2.5">Cancel</button>
      </div>
    </form>
  );
};

// ---------- One review in the list
const ReviewItem = ({ review }) => (
  <li className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm shadow-gray-900/3 sm:p-5">
    <div className="flex items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">{getInitials(review.author)}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-semibold text-gray-900">{review.author}</p>
          {review.isMine && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">You</span>}
          <span className="text-xs text-gray-400">{formatDate(review.createdAt)}{review.edited ? " · edited" : ""}</span>
        </div>
        <StarDisplay value={review.rating} size="xs" className="mt-1" />
        {review.title && <p className="mt-2 text-sm font-semibold text-gray-900">{review.title}</p>}
        {review.comment && <p className="mt-1 text-sm leading-6 whitespace-pre-line break-words text-gray-600">{review.comment}</p>}
      </div>
    </div>
  </li>
);

/**
 * Ratings and reviews on the property page. Anyone can read them; only signed-in
 * customers can rate or write one. Guests who pick a star (or "Write a review") get the
 * sign-in prompt through onRequireSignIn(rating) and come back with the rating kept.
 * resumeRating: a star count carried back from sign-in (opens the form with it selected).
 */
const PropertyReviews = ({ propertyId, user, onRequireSignIn, resumeRating, onResumeHandled, onSummary }) => {
  const { toast } = useToast();
  const isCustomer = user?.role === "user";
  const [sort, setSort] = useState("newest");
  const [list, setList] = useState({ items: [], page: 0, pages: 1, total: 0 });
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [mine, setMine] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error | more
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState(null); // null | { rating, title, comment, id? }
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const sectionRef = useRef(null);
  const request = useRef(0);

  // page 1 replaces the list (new sort, after a change); later pages are appended
  const load = useCallback(async (page, sortBy) => {
    const id = ++request.current;
    setStatus(page === 1 ? "loading" : "more");
    try {
      const data = await reviewApi.getPropertyReviews(propertyId, { page, limit: PAGE_SIZE, sort: sortBy });
      if (id !== request.current) return null; // a newer request (e.g. another sort) won
      setList((prev) => ({ items: page === 1 ? data.items : [...prev.items, ...data.items], page: data.page, pages: data.pages, total: data.total }));
      setSummary(data.summary);
      setMine(data.mine);
      setStatus("ready");
      setLoadError("");
      onSummary?.(data.summary);
      return data;
    } catch (err) {
      if (id === request.current) {
        setStatus("error");
        setLoadError(err.message);
      }
      return null;
    }
  }, [propertyId, onSummary]);

  useEffect(() => {
    load(1, sort);
  }, [load, sort]);

  // Back from sign-in with a star picked: open the form with it (their existing review if they have one)
  const resumed = useRef(false);
  useEffect(() => {
    if (resumeRating == null || !isCustomer || status !== "ready" || resumed.current) return;
    resumed.current = true;
    setForm(mine ? { ...mine, rating: resumeRating } : { rating: resumeRating, title: "", comment: "" });
    onResumeHandled?.();
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [resumeRating, isCustomer, status, mine, onResumeHandled]);

  const startReview = (rating = 0) => {
    if (!isCustomer) return onRequireSignIn?.(rating);
    setFormError("");
    setForm(mine ? { ...mine, ...(rating ? { rating } : {}) } : { rating, title: "", comment: "" });
  };

  const save = async (fields) => {
    setSaving(true);
    setFormError("");
    try {
      const result = form.id ? await reviewApi.updateReview(form.id, fields) : await reviewApi.submitReview(propertyId, fields);
      toast({ title: result.message });
      setForm(null);
      await load(1, sort);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setConfirmDelete(false);
    try {
      const result = await reviewApi.deleteReview(mine.id);
      toast({ title: result.message });
      setForm(null);
      await load(1, sort);
    } catch (err) {
      toast({ type: "error", title: err.message });
    }
  };

  if (status === "ready" && !summary.count && !mine && !form) return (
    <section ref={sectionRef} id="reviews" className="property-reviews-empty scroll-mt-24" aria-labelledby="property-reviews-heading">
      <h2 id="property-reviews-heading">Reviews</h2>
      <div className="property-review-invitation">
        <div className="property-review-art" aria-hidden="true"><MessageSquare /><span><Star /><Star /><Star /></span></div>
        <div><h3>Be the first to review this property</h3><p>Share your experience and help others make informed decisions.</p></div>
        <button type="button" onClick={() => startReview()}><Pencil size={19} aria-hidden="true" />Write a Review</button>
      </div>
    </section>
  );

  return (
    <section ref={sectionRef} id="reviews" className="scroll-mt-24 py-7 sm:py-8" aria-labelledby="property-reviews-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="property-reviews-heading" className="text-xl font-bold tracking-tight text-gray-900">Reviews{summary.count ? ` (${summary.count})` : ""}</h2>
        {!form && !mine && (
          <button type="button" onClick={() => startReview()} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700">
            <Pencil aria-hidden="true" className="h-4 w-4" />
            Write a review
          </button>
        )}
      </div>

      <div className="mt-5 grid gap-8 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-10">
        <Summary summary={summary} />

        <div className="min-w-0">
          {form ? (
            <div className="rounded-xl border border-gray-200 p-4 sm:p-5">
              <p className="mb-4 text-sm font-semibold text-gray-900">{form.id ? "Edit your review" : "Write a review"}</p>
              <ReviewForm key={form.id || "new"} initial={form} saving={saving} error={formError} onSubmit={save} onCancel={() => setForm(null)} />
            </div>
          ) : mine ? (
            <div className="rounded-xl border border-gray-200 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Your review</p>
                  <StarDisplay value={mine.rating} size="sm" className="mt-1" />
                </div>
                <div className="flex gap-1">
                  <button type="button" onClick={() => startReview()} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"><Pencil aria-hidden="true" className="h-3.5 w-3.5" />Edit</button>
                  <button type="button" onClick={() => setConfirmDelete(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-700"><Trash2 aria-hidden="true" className="h-3.5 w-3.5" />Delete</button>
                </div>
              </div>
              {mine.title && <p className="mt-3 text-sm font-semibold text-gray-900">{mine.title}</p>}
              {mine.comment && <p className="mt-1 text-sm leading-6 whitespace-pre-line break-words text-gray-600">{mine.comment}</p>}
              {mine.status === "hidden" && (
                <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <EyeOff aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  This review has been hidden by our moderators, so other customers can't see it and it doesn't count toward the rating.
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-xl bg-gray-50 p-4 sm:p-5">
              <p className="text-sm font-semibold text-gray-900">Rate this property</p>
              <p className="mt-0.5 text-sm text-gray-500">{isCustomer ? "Pick a star rating, then add a few words if you like." : "Viewed it or stayed here? Share your rating with other customers."}</p>
              <div className="mt-3">
                <StarInput value={0} onChange={startReview} label="Rate this property" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* The reviews */}
      <div className="mt-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {list.total > 0 && <p className="text-sm font-semibold text-gray-900">{list.total} {list.total === 1 ? "review" : "reviews"}</p>}
          {list.total > 1 && (
            <label className="flex items-center gap-2 text-sm text-gray-500">
              Sort by
              <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 outline-none focus:border-brand-500">
                {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
          )}
        </div>

        {status === "loading" && list.items.length === 0 ? (
          <div className="space-y-4" aria-busy="true">
            {[0, 1].map((i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-gray-50" />)}
          </div>
        ) : status === "error" && list.items.length === 0 ? (
          <div role="alert" className="rounded-lg border border-gray-200 p-4 text-sm text-gray-600">
            Couldn't load reviews. {loadError}{" "}
            <button type="button" onClick={() => load(1, sort)} className="font-semibold text-brand-600 hover:text-brand-700">Try again</button>
          </div>
        ) : list.items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500">No reviews yet. Be the first to rate this property.</p>
        ) : (
          <>
            <ul className={`grid gap-3 transition-opacity ${status === "loading" ? "opacity-60" : ""}`}>
              {list.items.map((review) => <ReviewItem key={review.id} review={review} />)}
            </ul>
            {list.page < list.pages && (
              <button type="button" onClick={() => load(list.page + 1, sort)} disabled={status === "more"} className="btn btn-light mt-4 w-full py-2.5 sm:w-auto">
                {status === "more" ? "Loading..." : "Show more reviews"}
              </button>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="Delete your review?"
        description="Your rating and review will be removed from this property. You can write a new one later."
        confirmLabel="Delete review"
      />
    </section>
  );
};

export default PropertyReviews;

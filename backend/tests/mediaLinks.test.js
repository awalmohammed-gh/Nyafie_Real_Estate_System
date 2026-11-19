import { test } from "node:test";
import assert from "node:assert/strict";
import { parseListingMedia, parseMediaLink } from "../utils/mediaLinks.js";
import { pickPropertyFields } from "../controllers/propertyController.js";

test("video links from YouTube and Vimeo become provider + id, whatever form was pasted", () => {
  for (const link of ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s", "https://youtu.be/dQw4w9WgXcQ?si=abc", "https://m.youtube.com/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/shorts/dQw4w9WgXcQ", "https://www.youtube.com/embed/dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"]) {
    assert.deepEqual(parseMediaLink(link), { provider: "youtube", id: "dQw4w9WgXcQ" }, link);
  }
  assert.deepEqual(parseMediaLink("https://vimeo.com/76979871"), { provider: "vimeo", id: "76979871" });
  assert.deepEqual(parseMediaLink("https://vimeo.com/76979871/8272103f6e"), { provider: "vimeo", id: "76979871", hash: "8272103f6e" }, "unlisted");
  assert.deepEqual(parseMediaLink("https://player.vimeo.com/video/76979871?h=8272103f6e"), { provider: "vimeo", id: "76979871", hash: "8272103f6e" });
  assert.deepEqual(parseMediaLink("https://vimeo.com/channels/staffpicks/76979871"), { provider: "vimeo", id: "76979871" });
});

test("3D tours from Matterport and Kuula", () => {
  assert.deepEqual(parseMediaLink("https://my.matterport.com/show/?m=SxQL3iGyoDo&play=1"), { provider: "matterport", id: "SxQL3iGyoDo" });
  assert.deepEqual(parseMediaLink("https://kuula.co/share/N1Gr8?logo=1"), { provider: "kuula", id: "N1Gr8" });
  assert.deepEqual(parseMediaLink("https://kuula.co/share/collection/7lVLq"), { provider: "kuula", id: "collection/7lVLq" });
});

test("anything else is refused: other sites, look-alike hosts, scripts and malformed ids", () => {
  for (const link of ["https://example.com/watch?v=dQw4w9WgXcQ", "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ", "javascript:alert(1)", "https://www.youtube.com/watch?v=short", "https://www.youtube.com/watch?v=dQw4w9WgXcQ<script>", "https://vimeo.com/about", "https://my.matterport.com/show/", "https://kuula.co/profile/someone", "not a link", ""]) {
    assert.equal(parseMediaLink(link), null, link);
  }
});

test("a listing's video must be a video and its 3D tour a tour; empty removes it", () => {
  assert.equal(parseListingMedia("", "video"), null);
  assert.equal(parseListingMedia(null, "tour"), null);
  assert.throws(() => parseListingMedia("https://my.matterport.com/show/?m=SxQL3iGyoDo", "video"), /YouTube or Vimeo/);
  assert.throws(() => parseListingMedia("https://youtu.be/dQw4w9WgXcQ", "tour"), /Matterport or Kuula/);
  assert.throws(() => parseListingMedia(`https://youtu.be/dQw4w9WgXcQ?x=${"a".repeat(600)}`, "video"), /YouTube or Vimeo/, "overlong");

  const fields = pickPropertyFields({ videoUrl: " https://youtu.be/dQw4w9WgXcQ ", virtualTourUrl: "https://kuula.co/share/N1Gr8" });
  assert.deepEqual(fields.video, { provider: "youtube", id: "dQw4w9WgXcQ" });
  assert.deepEqual(fields.virtualTour, { provider: "kuula", id: "N1Gr8" });
  assert.deepEqual(pickPropertyFields({ videoUrl: "" }), { video: null }, "cleared");
  assert.equal("video" in pickPropertyFields({ title: "Home" }), false, "left alone when not sent");
  assert.throws(() => pickPropertyFields({ videoUrl: "https://example.com/tour" }), (error) => error.status === 400);
});

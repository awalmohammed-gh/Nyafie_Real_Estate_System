import { test } from "node:test";
import assert from "node:assert/strict";
import { embedUrl, mediaLinkProblem, mediaThumbnail, parseMediaLink, shareUrl } from "../src/utils/mediaLinks.js";

test("the editor accepts each provider's usual links and explains the rest", () => {
  assert.equal(mediaLinkProblem("https://youtu.be/dQw4w9WgXcQ", "video"), "");
  assert.equal(mediaLinkProblem("https://kuula.co/share/N1Gr8", "tour"), "");
  assert.equal(mediaLinkProblem("", "video"), "");
  assert.match(mediaLinkProblem("https://my.matterport.com/show/?m=SxQL3iGyoDo", "video"), /3D tour field/);
  assert.match(mediaLinkProblem("https://example.com/house", "tour"), /Matterport or Kuula/);
  assert.equal(parseMediaLink("https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ"), null);
});

test("players and links are built only from the stored provider and id", () => {
  assert.equal(embedUrl({ provider: "youtube", id: "dQw4w9WgXcQ" }), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&modestbranding=1");
  assert.equal(embedUrl({ provider: "vimeo", id: "76979871", hash: "8272103f6e" }), "https://player.vimeo.com/video/76979871?autoplay=1&dnt=1&h=8272103f6e");
  assert.equal(embedUrl({ provider: "kuula", id: "collection/7lVLq" }), "https://kuula.co/share/collection/7lVLq?logo=1&info=1&fs=1&vr=0&thumbs=1");
  assert.equal(embedUrl({ provider: "elsewhere", id: "x" }), null);
  assert.equal(embedUrl(null), null);
  assert.equal(shareUrl({ provider: "matterport", id: "SxQL3iGyoDo" }), "https://my.matterport.com/show/?m=SxQL3iGyoDo");
  assert.equal(mediaThumbnail({ provider: "youtube", id: "dQw4w9WgXcQ" }), "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
  assert.equal(mediaThumbnail({ provider: "kuula", id: "N1Gr8" }), null);
  // Every stored link round-trips through the editor
  for (const media of [{ provider: "youtube", id: "dQw4w9WgXcQ" }, { provider: "vimeo", id: "76979871", hash: "8272103f6e" }, { provider: "matterport", id: "SxQL3iGyoDo" }, { provider: "kuula", id: "collection/7lVLq" }]) {
    assert.deepEqual(parseMediaLink(shareUrl(media)), media);
  }
});

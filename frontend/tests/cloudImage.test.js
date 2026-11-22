import { test } from "node:test";
import assert from "node:assert/strict";
import { cloudImage, cloudImageSources, cloudinaryAt, cloudLogo } from "../src/utils/cloudImage.js";
import { heroImageSources } from "../src/utils/hero.js";

const photo = "https://res.cloudinary.com/nyafie/image/upload/v123/nyafie/properties/home.jpg";

test("small images ask Cloudinary for a compressed copy sharp on retina screens", () => {
  // A 48px avatar needs 96 pixels; widths snap to a fixed set so copies are reused from the CDN cache
  assert.equal(cloudImage(photo, 48), "https://res.cloudinary.com/nyafie/image/upload/f_auto,q_auto,c_limit,w_96/v123/nyafie/properties/home.jpg");
  assert.match(cloudImage(photo, 80), /\/upload\/f_auto,q_auto,c_limit,w_160\/v123\//);
  assert.match(cloudImage(photo, 5000), /w_2560\//, "never beyond the largest stored size");
});

test("non-Cloudinary, vector, animated and already-sized images are left alone", () => {
  for (const url of ["/hero/home.jpg", "https://example.test/home.jpg", "data:image/jpeg;base64,abc", "", undefined, null,
    "https://res.cloudinary.com/nyafie/image/upload/v1/logo.svg", "https://res.cloudinary.com/nyafie/image/upload/v1/loop.gif"]) {
    assert.equal(cloudImage(url, 100), url);
  }
  const sized = cloudinaryAt(photo, 640);
  assert.equal(cloudImage(sized, 48), sized, "a transformation is never stacked on another");
  assert.deepEqual(cloudImageSources("/hero/home.jpg"), { src: "/hero/home.jpg" });
});

test("large images get a srcset so the browser downloads only the width it needs", () => {
  const sources = cloudImageSources(photo, "100vw");
  assert.equal(sources.sizes, "100vw");
  assert.match(sources.src, /w_960\//);
  for (const width of [480, 960, 1440, 1920]) assert.ok(sources.srcSet.includes(`w_${width}/v123/nyafie/properties/home.jpg ${width}w`));
});

test("hero slides keep their sizes", () => {
  const hero = heroImageSources(photo);
  assert.match(hero.src, /w_1920\//);
  for (const width of [960, 1440, 1920, 2560]) assert.ok(hero.srcSet.includes(`${width}w`));
});

test("uploaded logos are trimmed of empty margins at one cached size; other logos are left alone", () => {
  const upload = "https://res.cloudinary.com/demo/image/upload/v1/nyafie/uploads/logo.png";
  assert.equal(cloudLogo(upload), "https://res.cloudinary.com/demo/image/upload/e_trim/f_auto,q_auto,c_limit,h_144/v1/nyafie/uploads/logo.png");
  assert.equal(cloudLogo(cloudLogo(upload)), cloudLogo(upload), "never trimmed twice");
  assert.equal(cloudLogo("/brand/nyafie-logo-purple.png"), "/brand/nyafie-logo-purple.png", "site files are already trimmed");
  assert.equal(cloudLogo("https://res.cloudinary.com/demo/image/upload/v1/logo.svg"), "https://res.cloudinary.com/demo/image/upload/v1/logo.svg", "vector logos are served as stored");
});

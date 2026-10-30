import { test } from "node:test";
import assert from "node:assert/strict";
import { propertyCardImageSources } from "../src/utils/propertyImages.js";

test("listing cards request responsive Cloudinary images while retaining the asset version", () => {
  const source = propertyCardImageSources("https://res.cloudinary.com/nyafie/image/upload/v123/home.jpg");
  assert.equal(source.src, "https://res.cloudinary.com/nyafie/image/upload/f_auto,q_auto,c_limit,w_640/v123/home.jpg");
  for (const width of [320, 480, 640, 960]) assert.ok(source.srcSet.includes(`w_${width}/v123/home.jpg ${width}w`));
  assert.ok(source.sizes.includes("100vw"));
});

test("local, external and data images keep their original URL", () => {
  for (const url of ["/properties/home.jpg", "https://example.test/home.jpg", "data:image/png;base64,abc", ""]) {
    assert.deepEqual(propertyCardImageSources(url), { src: url });
  }
});

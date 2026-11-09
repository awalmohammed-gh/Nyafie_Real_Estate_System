# Landing page reference assets

The landing page was adapted inside the existing React/Vite application. Its
catalogue, map search, favourites, account controls and agent routes use the
existing application APIs and routing. Homepage card styling is an explicit
variant so catalogue cards retain their existing design.

## Generated imagery

Created with the built-in image generator for this reference design. These are
decorative promotional images, not photographs of catalogue properties.

| Saved asset | Prompt description |
| --- | --- |
| `frontend/public/hero/nyafie-modern-villa.jpg` | Photorealistic panoramic architectural photograph, 3:1 composition. Contemporary two-storey white cubic villa with a dark stone centre, glass balconies and warm interior lighting at dusk. Place the villa on the right two thirds; leave spacious lavender and pink sky and lawn on the left for white headline text. Tropical Ghanaian palms. No text, logos or interface elements. |
| `frontend/public/banners/nyafie-agent-consultation.jpg` | Photorealistic landscape photograph, 3:2 composition. Ghanaian Black male property agent wearing a purple blazer and white shirt, holding a tablet on the left, talking to a smiling Ghanaian Black couple on the right. The man wears a light blue shirt; the woman has braids and a beige blouse. Contemporary cream home and garden in daylight. No text or logos. |
| `frontend/public/banners/nyafie-land.jpg` | Photorealistic landscape photograph, 3:2 composition. Level undeveloped green grassy plot in suburban Accra, low hedge and tropical trees, blue sky with white clouds. No foreground buildings, people, text or logos. |

The original generated PNGs remain in the session's generated-images directory.
Project assets were exported as optimized JPEGs. The hero also has a 960px
responsive derivative at `frontend/public/hero/nyafie-modern-villa-960.jpg`.

## Functional details

- The opening slide introduces the platform; subsequent slides use the saved
  homepage slide content. Automatic rotation respects reduced motion and holds
  while visitors use the search form. There are no play or pause buttons.
- Featured listings and their prices, agents, favourites and view counts use
  actual catalogue data.
- Category tiles link to the existing catalogue filters, including an empty
  state when a category has no inventory.
- The updates form submits a request to the existing contact inbox. Automated
  newsletter subscription or delivery is not configured by this change.
- Only existing company pages and configured social profiles are linked.

## Verification

Production build and the frontend test suite passed. Browser visual comparison
could not be completed because the browser access host was unavailable.

/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
async function hashSeed(seed: string): Promise<string> {
	const encoder = new TextEncoder();  // Convert the seed string to a Uint8Array
	const data = encoder.encode(seed);  // UTF-8 encoding of the seed string
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);  // Generate SHA-256 hash
	const hashArray = Array.from(new Uint8Array(hashBuffer));  // Convert ArrayBuffer to array
	const hashHex = hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');  // Convert to hex string
	return hashHex;  // Return the hash in hexadecimal format
}

function getImageFromHash(seedHash: string, baseUrl: string): string {
	// Here we take the first 8 characters of the hash and convert it to an index
	const index = parseInt(seedHash.substring(0, 8), 16) % 10;  // Assume we have 10 SVG images

	// Map index to corresponding SVG filename
	const svgAssets = Array.from({ length: 20 }, (_, i) => {
		const index = i + 1;
		const paddedIndex = index.toString().padStart(2, '0');
		return `${baseUrl}/hand-drawn-avatar-${paddedIndex}.png`;
	});

	return svgAssets[index];  // Return the selected SVG filename
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		const seed = url.searchParams.get('seed');  // Get the seed from the URL
		if (!seed) {
			return new Response('Seed parameter is missing', { status: 400 });
		}

		const seedHash = await hashSeed(seed);  // Hash the seed to get a consistent identifier
		const baseUrl = env.BUCKET_URL;

		const imageUrl = getImageFromHash(seedHash, baseUrl);  // Get the image URL based on the hash

		// Check for cache in Cloudflare Cache
		let cachedResponse = await caches.default.match(imageUrl);  // Try to get the cached image
		if (cachedResponse) {
			// If the image is cached, serve it from the cache
			return cachedResponse;
		}

		const response = await fetch(imageUrl);  // Fetch the image from the URL

		if (!response.ok) {
			return new Response('Image not found', { status: 404 });
		}

		const imageBlob = await response.blob();  // Convert the response to a Blob
		const headers = new Headers(response.headers);  // Copy the original response headers
		headers.set('Content-Type', 'image/png');  // Set the content type to PNG

		// Cache the image for subsequent requests
		const cacheControl = 'public, max-age=31536000';  // Cache for 365 days
		headers.set('Cache-Control', cacheControl);  // Set the cache control header

		// Put the fetched image in cache
		const cacheKey = new Request(imageUrl);  // Use the image URL as the cache key
		ctx.waitUntil(caches.default.put(cacheKey, new Response(imageBlob, { headers })));

		return new Response(imageBlob, {
			headers: headers,
			status: 200,
		});  // Return the image as a response
	},
} satisfies ExportedHandler<Env>;

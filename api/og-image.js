export const config = {
    runtime: 'edge', // Fast edge execution
};

export default async function handler(req) {
    try {
        const { searchParams } = new URL(req.url);
        const targetUrl = searchParams.get('url');

        if (!targetUrl) {
            return new Response('Missing url parameter', { status: 400 });
        }

        // Attempt to fetch the HTML
        const response = await fetch(targetUrl, {
            headers: {
                // Many news sites allow GoogleBot or Twitterbot to scrape OG tags for rich previews
                'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            },
            signal: AbortSignal.timeout(6000) // Don't hang forever
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch url: ${response.status}`);
        }

        const html = await response.text();

        // Regex to extract og:image or twitter:image
        const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
            html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["'][^>]*>/i);

        const twitterImageMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
            html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["'][^>]*>/i);

        let imageUrl = null;
        if (ogImageMatch && ogImageMatch[1]) {
            imageUrl = ogImageMatch[1];
        } else if (twitterImageMatch && twitterImageMatch[1]) {
            imageUrl = twitterImageMatch[1];
        } else {
            // Fallback: look for generic article image or first large image
            throw new Error('No open graph image found');
        }

        // Handle relative URLs
        if (imageUrl.startsWith('/')) {
            const urlObj = new URL(targetUrl);
            imageUrl = `${urlObj.protocol}//${urlObj.host}${imageUrl}`;
        }

        // Redirect to the parsed image, heavily cached on standard Vercel Edge Cache
        return new Response(null, {
            status: 302,
            headers: {
                'Location': imageUrl,
                'Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=86400'
            }
        });

    } catch (error) {
        console.error('OG Image Fetch Error:', error.message);
        // Return 404 to trigger client-side fallback
        return new Response('Not found', { status: 404 });
    }
}

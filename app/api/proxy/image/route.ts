import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const imageId = searchParams.get('id');
  const legacyUrl = searchParams.get('url');

  let targetUrl = '';

  if (imageId) {
    targetUrl = `https://crustdata-media.s3.us-east-2.amazonaws.com/${imageId}`;
  } else if (legacyUrl && legacyUrl.startsWith('https://crustdata-media.s3.us-east-2.amazonaws.com')) {
    targetUrl = legacyUrl;
  } else {
    return new NextResponse('Forbidden: Invalid image source or missing ID', { status: 403 });
  }

  try {
    // Fetch the image from S3
    const response = await fetch(targetUrl, {
      headers: {
        'Accept': 'image/*'
      }
    });

    if (!response.ok) {
      return new NextResponse(`Failed to fetch image: ${response.statusText}`, { status: response.status });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = await response.arrayBuffer();

    // Serve the image with caching headers to improve performance
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable', // Cache for 1 year
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: any) {
    console.error('Image proxy error:', error);
    return new NextResponse('Error fetching image', { status: 500 });
  }
}

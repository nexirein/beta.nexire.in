import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get('url');

  if (!imageUrl) {
    return new NextResponse('Missing URL', { status: 400 });
  }

  // Security: Only allow Crustdata S3 URLs
  if (!imageUrl.startsWith('https://crustdata-media.s3.us-east-2.amazonaws.com')) {
    return new NextResponse('Forbidden: Invalid image source', { status: 403 });
  }

  try {
    // Fetch the image from S3
    const response = await fetch(imageUrl, {
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

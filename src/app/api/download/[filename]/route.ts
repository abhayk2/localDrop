// This route is no longer used in the P2P implementation.
// It is kept as a placeholder.
import { NextResponse } from 'next/server';

export async function GET() {
  return new NextResponse('This endpoint is not used.', { status: 404 });
}

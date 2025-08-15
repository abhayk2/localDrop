import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { stat } from 'fs/promises';

export async function GET(req: NextRequest, { params }: { params: { filename: string } }) {
  const filename = decodeURIComponent(params.filename);

  if (!filename || filename.includes('..') || filename.includes('/')) {
    return new NextResponse('Invalid filename provided.', { status: 400 });
  }

  const uploadsDir = path.join(process.cwd(), 'uploads');
  const filePath = path.join(uploadsDir, filename);

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      return new NextResponse('Requested path is not a file.', { status: 400 });
    }

    const fileBuffer = await fs.readFile(filePath);

    const headers = new Headers();
    headers.set('Content-Type', 'application/octet-stream');
    headers.set('Content-Disposition', `attachment; filename="${filename}"`);
    headers.set('Content-Length', fileStat.size.toString());

    return new NextResponse(fileBuffer, { status: 200, headers });
  } catch (error) {
    console.error('File download error:', error);
    return new NextResponse('File not found.', { status: 404 });
  }
}

import { promises as fs } from 'fs';
import path from 'path';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { FileUploadForm } from '@/components/file-upload-form';
import { FileList } from '@/components/file-list';
import { UploadCloud, Wifi } from 'lucide-react';

export default async function Home() {
  const uploadsDir = path.join(process.cwd(), 'uploads');
  let files: string[] = [];

  try {
    await fs.access(uploadsDir);
    files = (await fs.readdir(uploadsDir)).filter(file => file !== '.gitkeep');
  } catch (error) {
    console.info("Uploads directory doesn't exist. It will be created on the first upload.");
  }

  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center p-4 sm:p-8">
      <div className="flex items-center gap-3 mb-6">
        <Wifi className="h-10 w-10 text-primary" />
        <h1 className="text-4xl font-bold tracking-tight text-center font-headline">
          LocalDrop
        </h1>
      </div>
      <Card className="w-full max-w-2xl shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UploadCloud className="h-6 w-6" />
            Upload File
          </CardTitle>
          <CardDescription>
            Select a file to upload. Your file will be scanned for threats before being saved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FileUploadForm />
        </CardContent>
        <Separator className="my-4" />
        <CardHeader>
          <CardTitle>Available Files</CardTitle>
          <CardDescription>
            Click on a file to download it to your device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FileList files={files} />
        </CardContent>
      </Card>
    </main>
  );
}

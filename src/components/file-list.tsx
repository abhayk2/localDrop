import { getFileIcon } from '@/components/file-icon';
import { Button } from '@/components/ui/button';
import { Download, HardDrive, List } from 'lucide-react';

interface FileListProps {
  files: string[];
}

export function FileList({ files }: FileListProps) {
  if (files.length === 0) {
    return (
      <div className="text-center text-muted-foreground p-8 border-2 border-dashed rounded-lg">
        <HardDrive className="mx-auto h-12 w-12" />
        <p className="mt-4">No files found.</p>
        <p>Upload a file to get started!</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-md border">
        {files.map((file) => {
          const Icon = getFileIcon(file);
          return (
            <li key={file} className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-3 truncate">
                <Icon className="h-6 w-6 flex-shrink-0 text-primary" />
                <span className="truncate font-medium">{file}</span>
              </div>
              <Button asChild variant="ghost" size="icon">
                <a href={`/api/download/${encodeURIComponent(file)}`} download>
                  <Download className="h-5 w-5" />
                  <span className="sr-only">Download {file}</span>
                </a>
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

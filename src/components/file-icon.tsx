import {
  File,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  FileText,
  type LucideProps,
} from 'lucide-react';
import type { FC } from 'react';

export const getFileIcon = (filename: string): FC<LucideProps> => {
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';

  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(extension)) {
    return FileImage;
  }
  if (['mp4', 'mov', 'avi', 'webm', 'mkv', 'flv'].includes(extension)) {
    return FileVideo;
  }
  if (['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(extension)) {
    return FileAudio;
  }
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(extension)) {
    return FileArchive;
  }
  if (
    [
      'js',
      'jsx',
      'ts',
      'tsx',
      'html',
      'css',
      'json',
      'py',
      'java',
      'c',
      'cpp',
      'go',
      'rs',
      'sh',
    ].includes(extension)
  ) {
    return FileCode;
  }
  if (['csv', 'xls', 'xlsx', 'ods'].includes(extension)) {
    return FileSpreadsheet;
  }
  if (['doc', 'docx', 'txt', 'pdf', 'md', 'rtf', 'odt'].includes(extension)) {
    return FileText;
  }
  return File;
};

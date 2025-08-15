'use server';

import { promises as fs } from 'fs';
import path from 'path';
import { revalidatePath } from 'next/cache';
import { analyzeThreats } from '@/ai/flows/analyze-threats';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const SECRET_PASSWORD = 'password';

type State = {
  success: boolean;
  message: string;
};

export async function uploadFile(
  prevState: State | null,
  formData: FormData
): Promise<State> {
  const file = formData.get('file') as File | null;
  const password = formData.get('password') as string | null;

  if (password !== SECRET_PASSWORD) {
    return { success: false, message: 'Invalid password.' };
  }

  if (!file || file.size === 0) {
    return { success: false, message: 'Please select a file to upload.' };
  }

  try {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    const dataUri = `data:${file.type};base64,${buffer.toString('base64')}`;

    const analysisResult = await analyzeThreats({
      fileDataUri: dataUri,
      filename: file.name,
    });

    if (analysisResult.hasThreats) {
      return {
        success: false,
        message: `Threat detected: ${analysisResult.threatReport}`,
      };
    }

    const filePath = path.join(UPLOADS_DIR, file.name);
    await fs.writeFile(filePath, buffer);

    revalidatePath('/');
    return { success: true, message: `"${file.name}" uploaded successfully and is safe.` };
  } catch (error) {
    console.error(error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return { success: false, message: `Failed to upload file: ${errorMessage}` };
  }
}

'use client';

import React, { useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { uploadFile } from '@/app/actions';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Upload } from 'lucide-react';

const initialState = {
  success: false,
  message: '',
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Uploading & Analyzing...
        </>
      ) : (
        <>
          <Upload className="mr-2 h-4 w-4" />
          Upload File
        </>
      )}
    </Button>
  );
}

export function FileUploadForm() {
  const [state, formAction] = useFormState(uploadFile, initialState);
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state && state.message) {
      if (state.success) {
        toast({
          title: 'Success!',
          description: state.message,
          className: 'bg-accent text-accent-foreground',
        });
        formRef.current?.reset();
      } else {
        toast({
          variant: 'destructive',
          title: 'Upload Failed',
          description: state.message,
        });
      }
    }
  }, [state, toast]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="grid w-full max-w-sm items-center gap-1.5">
        <Label htmlFor="file">File</Label>
        <Input id="file" name="file" type="file" required />
      </div>
      <div className="grid w-full max-w-sm items-center gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" required />
      </div>
      <SubmitButton />
    </form>
  );
}

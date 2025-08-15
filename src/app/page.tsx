import { P2PProvider } from '@/components/p2p-provider';
import { PeerProvider } from '@/hooks/use-peer';
import { TransferView } from '@/components/transfer-view';
import { Wifi } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

export default function Home() {
  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center bg-background p-4 sm:p-8 relative">
       <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
      <div className="flex items-center gap-3 mb-6">
        <Wifi className="h-10 w-10 text-primary" />
        <h1 className="text-5xl font-bold tracking-tight text-center font-headline">
          LocalDrop
        </h1>
      </div>
      <P2PProvider>
        <PeerProvider>
          <TransferView />
        </PeerProvider>
      </P2PProvider>
    </main>
  );
}

import { P2PProvider } from '@/components/p2p-provider';
import { PeerProvider } from '@/hooks/use-peer';
import { TransferView } from '@/components/transfer-view';
import { Wifi } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="absolute top-0 right-0 p-4 sm:p-6">
        <ThemeToggle />
      </header>

      <main className="flex-grow flex flex-col items-center justify-center p-4">
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
      
      <footer className="w-full text-center p-4 text-xs text-muted-foreground">
        <p>Developed by Abhay | <a href="mailto:abhayk176@duck.com" className="hover:underline">abhayk176@duck.com</a></p>
      </footer>
    </div>
  );
}

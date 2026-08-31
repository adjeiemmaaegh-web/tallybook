import { cn } from "@/lib/utils";
/** Tactile Ledger design reminder: errors preserve calm, offer recovery, and never expose private technical details. */
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-paper p-6">
          <div className="w-full max-w-xl border-l-4 border-clay bg-white p-7 shadow-[0_18px_45px_rgba(41,35,28,0.10)] sm:p-10">
            <AlertTriangle
              size={36}
              className="mb-6 text-clay"
            />

            <p className="ledger-kicker">A safe pause</p>
            <h2 className="font-display mt-2 text-3xl font-semibold tracking-[-0.035em] text-ink">We could not open this screen.</h2>

            <p className="mt-4 max-w-md text-sm leading-6 text-ink-soft">Refreshing may restore the screen. This message does not remove or change any records stored on your device.</p>

            <button
              onClick={() => window.location.reload()}
              className="primary-action mt-7"
            >
              <RotateCcw size={16} />
              Refresh Tallybook
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

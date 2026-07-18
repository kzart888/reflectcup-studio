import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

export default function HomePage() {
  return (
    <main className="landing-shell">
      <section className="landing-card">
        <div className="brand-mark" aria-hidden="true"><Sparkles size={20} /></div>
        <p className="eyebrow">ReflectCup Studio</p>
        <h1>Turn a photograph into a reflection.</h1>
        <p className="lede">
          Position your image, preview the physical reflection from every angle, and save a print-ready test design.
        </p>
        <Link className="primary-link" href="/studio/new">
          Create a new design <ArrowRight size={18} />
        </Link>
        <p className="fine-print">Digital optical prototype · Physical calibration pending</p>
      </section>
    </main>
  );
}

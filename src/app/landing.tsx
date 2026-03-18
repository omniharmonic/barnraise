"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Users,
  Clock,
  CheckCircle2,
  ArrowRight,
  Sprout,
  HandHeart,
  RotateCcw,
} from "lucide-react";

const traditions = [
  {
    name: "Gotong Royong",
    origin: "Indonesia",
    description:
      "The Javanese practice of communal labor where villages build houses, harvest fields, and maintain roads together. Everyone gives; everyone receives.",
    era: "Ancient — Present",
  },
  {
    name: "Meitheal",
    origin: "Ireland",
    description:
      "Gaelic cooperative labor tradition where farming communities pooled their efforts for harvest, thatching, and turf-cutting. Work was tracked informally — no one kept exact score.",
    era: "Medieval — 20th Century",
  },
  {
    name: "Minga",
    origin: "Andes (Quechua)",
    description:
      "A reciprocal communal work tradition in the Andean highlands. Communities gather to build infrastructure, tend fields, and celebrate together. Participation is both obligation and honor.",
    era: "Pre-Inca — Present",
  },
  {
    name: "Barn Raising",
    origin: "North America",
    description:
      "Frontier communities assembled to build a neighbor's barn in a single day. Reciprocity was implicit — when your time came, the community showed up for you.",
    era: "18th — 19th Century",
  },
  {
    name: "Naffīr",
    origin: "Sudan",
    description:
      "Communal work parties called when labor demand exceeds what a family can provide. Neighbors help with farming, building, and ceremonies, expecting the same in return.",
    era: "Ancient — Present",
  },
  {
    name: "Dugnad",
    origin: "Norway",
    description:
      "Voluntary communal work for the common good. Apartment buildings, neighborhoods, and sports clubs organize regular dugnads for maintenance and improvement.",
    era: "Viking Age — Present",
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-cream">
      {/* Nav */}
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-cream/80 border-b border-earth/30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/barn_raise_no_bg.png"
              alt="Barn Raise"
              width={36}
              height={36}
              className="object-contain"
            />
          </div>
          <Link href="/sign-in">
            <Button>Get Started</Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-12 sm:pt-20 pb-16 sm:pb-24 text-center">
        <div className="flex justify-center mb-6 sm:mb-8">
          <Image
            src="/barn_raise_no_bg.png"
            alt="Barn Raise"
            width={120}
            height={120}
            className="object-contain w-20 h-20 sm:w-[120px] sm:h-[120px]"
          />
        </div>
        <h1 className="text-3xl sm:text-5xl md:text-6xl font-display text-walnut tracking-tight leading-tight mb-4 sm:mb-6 animate-fade-in-up">
          Labor that flows,
          <br />
          <span className="text-barn">not labor that&apos;s owed.</span>
        </h1>
        <p className="text-base sm:text-lg text-walnut-muted max-w-2xl mx-auto mb-8 sm:mb-10 animate-fade-in-up stagger-1">
          Barn Raise is a time-banking tool for communities who coordinate work
          through voluntary reciprocity — not money, not coercion, not keeping
          exact score. Just neighbors helping neighbors.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 animate-fade-in-up stagger-2">
          <Link href="/sign-in" className="w-full sm:w-auto">
            <Button size="lg" className="text-base px-8 w-full sm:w-auto">
              Start Your Pool
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <a href="#how-it-works" className="w-full sm:w-auto">
            <Button variant="outline" size="lg" className="text-base w-full sm:w-auto">
              Learn More
            </Button>
          </a>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="bg-cream-dark/40 border-y border-earth/20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
          <h2 className="text-2xl sm:text-3xl font-display text-walnut text-center mb-4">
            How It Works
          </h2>
          <p className="text-walnut-muted text-center max-w-xl mx-auto mb-14">
            A simple cycle: host events that need work, show up for others,
            and let the hours flow between you.
          </p>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6 sm:gap-8">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-barn-light flex items-center justify-center mx-auto mb-4">
                <Sprout className="h-6 w-6 text-barn" />
              </div>
              <h3 className="font-display text-walnut text-lg mb-2">
                1. Create a Pool
              </h3>
              <p className="text-sm text-walnut-muted leading-relaxed">
                Invite your neighbors, co-op members, or community group. Set
                governance rules — how people join, starting balances, and
                negative limits.
              </p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-sage-light flex items-center justify-center mx-auto mb-4">
                <HandHeart className="h-6 w-6 text-sage" />
              </div>
              <h3 className="font-display text-walnut text-lg mb-2">
                2. Host &amp; Contribute
              </h3>
              <p className="text-sm text-walnut-muted leading-relaxed">
                Need help with a garden build, a move, or a repair day? Create
                an event. Others claim slots and commit hours. Show up, do the
                work, earn hours.
              </p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-golden-light flex items-center justify-center mx-auto mb-4">
                <RotateCcw className="h-6 w-6 text-golden-dark" />
              </div>
              <h3 className="font-display text-walnut text-lg mb-2">
                3. Reciprocity Flows
              </h3>
              <p className="text-sm text-walnut-muted leading-relaxed">
                Hosts spend hours from their balance; contributors earn them.
                Over time, a healthy rhythm of giving and receiving emerges —
                like a tide, not a ledger.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Key features */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <h2 className="text-2xl sm:text-3xl font-display text-walnut text-center mb-8 sm:mb-14">
          Built for Real Communities
        </h2>
        <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
          {[
            {
              icon: Users,
              title: "Solo & Group Hosting",
              desc: "Host alone from your balance, or co-host with others who pledge hours to fund bigger events together.",
            },
            {
              icon: Clock,
              title: "Flexible Hours",
              desc: "Contributors commit what they can — full shifts or partial. The system handles proportional splits at verification.",
            },
            {
              icon: CheckCircle2,
              title: "Verified Attendance",
              desc: "Hosts verify who showed up after the event. Hours flow only for actual work — no-shows are flagged, not penalized.",
            },
            {
              icon: RotateCcw,
              title: "Pool Health Dashboard",
              desc: "See reciprocity distributions, fill rates, no-show rates, and activity trends. Healthy pools self-correct.",
            },
          ].map((feature) => (
            <Card key={feature.title} className="group hover:border-barn/30 transition-colors">
              <CardContent className="pt-6 flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-cream-dark flex items-center justify-center shrink-0">
                  <feature.icon className="h-5 w-5 text-walnut-muted group-hover:text-barn transition-colors" />
                </div>
                <div>
                  <h3 className="font-display text-walnut mb-1">{feature.title}</h3>
                  <p className="text-sm text-walnut-muted leading-relaxed">
                    {feature.desc}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Cultural lineage */}
      <section className="bg-walnut text-cream">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
          <h2 className="text-2xl sm:text-3xl font-display text-center mb-4">
            A Lineage of Reciprocal Labor
          </h2>
          <p className="text-cream-dark/80 text-center max-w-2xl mx-auto mb-14">
            Barn Raise draws from a global tradition of communities organizing
            work through voluntary reciprocity. These practices span continents
            and millennia — proof that this way of working together is deeply
            human.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {traditions.map((t) => (
              <div
                key={t.name}
                className="p-4 sm:p-5 rounded-2xl border border-cream/10 bg-cream/5 hover:bg-cream/10 transition-colors"
              >
                <div className="flex items-baseline justify-between gap-2 mb-2">
                  <h3 className="font-display text-base sm:text-lg text-cream">
                    {t.name}
                  </h3>
                  <span className="text-xs text-cream-dark/60 font-mono">
                    {t.era}
                  </span>
                </div>
                <div className="text-xs text-golden uppercase tracking-wider mb-2">
                  {t.origin}
                </div>
                <p className="text-sm text-cream-dark/70 leading-relaxed">
                  {t.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-display text-walnut mb-4">
          Ready to raise your barn?
        </h2>
        <p className="text-walnut-muted max-w-lg mx-auto mb-8">
          Create a labor pool for your neighborhood, cooperative, land project,
          or community group. It takes two minutes.
        </p>
        <Link href="/sign-in" className="inline-block">
          <Button size="lg" className="text-base px-10 w-full sm:w-auto">
            Get Started
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-earth/30 py-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image
              src="/barn_raise_no_bg.png"
              alt="Barn Raise"
              width={24}
              height={24}
              className="object-contain opacity-50"
            />
            <span className="text-sm text-walnut-muted">
              Barn Raise
            </span>
          </div>
          <span className="text-xs text-walnut-muted/50">
            Labor that flows.
          </span>
        </div>
      </footer>
    </div>
  );
}

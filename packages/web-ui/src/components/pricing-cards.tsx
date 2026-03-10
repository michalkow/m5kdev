import { Check, type LucideIcon, MoveRight, PhoneCall } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

interface Feature {
  title: string;
  description: string;
}

interface PricingCardProps {
  title: string;
  description: string;
  price: number;
  features: Feature[];
  highlighted?: boolean;
  ctaText: string;
  ctaIcon: LucideIcon;
  variant?: "default" | "outline";
}

function PricingCard({
  title,
  description,
  price,
  features,
  highlighted = false,
  ctaText,
  ctaIcon: CtaIcon,
  variant = "outline",
}: PricingCardProps) {
  const Icon = CtaIcon;
  return (
    <Card className={`w-full rounded-md ${highlighted ? "shadow-2xl" : ""}`}>
      <CardHeader>
        <CardTitle>
          <span className="flex flex-row gap-4 items-center font-normal">{title}</span>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-8 justify-start">
          <p className="flex flex-row items-center gap-2 text-xl">
            <span className="text-4xl">${price}</span>
            <span className="text-sm text-muted-foreground"> / month</span>
          </p>
          <div className="flex flex-col gap-4 justify-start">
            {features.map((feature, index) => (
              <div key={index} className="flex flex-row gap-4">
                <Check className="w-4 h-4 mt-2 text-primary" />
                <div className="flex flex-col">
                  <p>{feature.title}</p>
                  <p className="text-muted-foreground text-sm">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
          <Button variant={variant} className="gap-4">
            {ctaText} <Icon className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function PricingCards() {
  const commonDescription =
    "Our goal is to streamline SMB trade, making it easier and faster than ever for everyone and everywhere.";

  const commonFeatures = [
    {
      title: "Fast and reliable",
      description: "We've made it fast and reliable.",
    },
    {
      title: "Fast and reliable",
      description: "We've made it fast and reliable.",
    },
    {
      title: "Fast and reliable",
      description: "We've made it fast and reliable.",
    },
  ];

  return (
    <div className="w-full py-20 lg:py-40">
      <div className="container mx-auto">
        <div className="flex text-center justify-center items-center gap-4 flex-col">
          <Badge>Pricing</Badge>
          <div className="flex gap-2 flex-col">
            <h2 className="text-3xl md:text-5xl tracking-tighter max-w-xl text-center font-regular">
              Prices that make sense!
            </h2>
            <p className="text-lg leading-relaxed tracking-tight text-muted-foreground max-w-xl text-center">
              Managing a small business today is already tough.
            </p>
          </div>
          <div className="grid pt-20 text-left grid-cols-1 lg:grid-cols-3 w-full gap-8">
            <PricingCard
              title="Startup"
              description={commonDescription}
              price={40}
              features={commonFeatures}
              ctaText="Sign up today"
              ctaIcon={MoveRight}
              variant="outline"
            />
            <PricingCard
              title="Growth"
              description={commonDescription}
              price={40}
              features={commonFeatures}
              highlighted={true}
              ctaText="Sign up today"
              ctaIcon={MoveRight}
              variant="default"
            />
            <PricingCard
              title="Enterprise"
              description={commonDescription}
              price={40}
              features={commonFeatures}
              ctaText="Book a meeting"
              ctaIcon={PhoneCall}
              variant="outline"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";

const SCENARIO_TYPES = [
  "cold_call",
  "discovery",
  "objection_handling",
  "closing",
  "custom",
] as const;

const INDUSTRIES = [
  "Technology",
  "Healthcare",
  "Finance",
  "Manufacturing",
  "Retail",
  "Real Estate",
  "Education",
  "Other",
] as const;

const ScenarioSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().min(1, "Description is required"),
  industry: z.string().min(1),
  type: z.enum(SCENARIO_TYPES),
  config_json: z.object({
    specific_objections: z.array(z.string()).optional(),
    discovery_questions: z.array(z.string()).optional(),
    product_details: z.string().optional(),
    competitive_notes: z.string().optional(),
  }),
});

export default function NewScenarioPage() {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [industry, setIndustry] = useState("");
  const [type, setType] = useState<string>("custom");
  const [objections, setObjections] = useState("");
  const [discoveryQuestions, setDiscoveryQuestions] = useState("");
  const [productDetails, setProductDetails] = useState("");
  const [competitiveNotes, setCompetitiveNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const config_json = {
      specific_objections: objections
        ? objections
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
      discovery_questions: discoveryQuestions
        ? discoveryQuestions
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
      product_details: productDetails || undefined,
      competitive_notes: competitiveNotes || undefined,
    };

    const parsed = ScenarioSchema.safeParse({
      name,
      description,
      industry,
      type,
      config_json,
    });

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field) fieldErrors[String(field)] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("users")
      .select("org_id, role")
      .eq("id", user.id)
      .single();

    if (!profile?.org_id) return;
    if (profile.role !== "admin" && profile.role !== "manager") {
      setErrors({ name: "Only managers and admins can create scenarios" });
      setSubmitting(false);
      return;
    }

    const { error } = await supabase.from("scenarios").insert({
      name: parsed.data.name,
      description: parsed.data.description,
      industry: parsed.data.industry,
      type: parsed.data.type,
      config_json: parsed.data.config_json,
      org_id: profile.org_id,
      is_custom: true,
    });

    if (error) {
      setErrors({ name: error.message });
      setSubmitting(false);
      return;
    }

    router.push("/scenarios");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Create Custom Scenario
        </h1>
        <p className="text-muted-foreground">
          Design a custom scenario for your team to practice.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scenario Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="e.g. Enterprise SaaS Discovery"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe the scenario and what reps should practice..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
              {errors.description && (
                <p className="text-sm text-destructive">
                  {errors.description}
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Industry</Label>
                <Select value={industry} onValueChange={setIndustry}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select industry" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map((ind) => (
                      <SelectItem key={ind} value={ind}>
                        {ind}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCENARIO_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">
              Advanced Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="objections">
                Specific Objections{" "}
                <Badge variant="outline" className="ml-1 text-xs">
                  optional
                </Badge>
              </Label>
              <Textarea
                id="objections"
                placeholder="Enter one objection per line..."
                value={objections}
                onChange={(e) => setObjections(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                The AI persona will raise these specific objections during the
                simulation.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="discoveryQuestions">
                Required Discovery Questions{" "}
                <Badge variant="outline" className="ml-1 text-xs">
                  optional
                </Badge>
              </Label>
              <Textarea
                id="discoveryQuestions"
                placeholder="Enter one question per line..."
                value={discoveryQuestions}
                onChange={(e) => setDiscoveryQuestions(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Questions the rep should ask. The scorecard will check for
                coverage.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="productDetails">
                Product/Service Details{" "}
                <Badge variant="outline" className="ml-1 text-xs">
                  optional
                </Badge>
              </Label>
              <Textarea
                id="productDetails"
                placeholder="Key product features, pricing, differentiators..."
                value={productDetails}
                onChange={(e) => setProductDetails(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="competitiveNotes">
                Competitive Landscape Notes{" "}
                <Badge variant="outline" className="ml-1 text-xs">
                  optional
                </Badge>
              </Label>
              <Textarea
                id="competitiveNotes"
                placeholder="Key competitors, their strengths/weaknesses..."
                value={competitiveNotes}
                onChange={(e) => setCompetitiveNotes(e.target.value)}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Preview */}
        {name && (
          <Card className="mt-4 border-dashed">
            <CardHeader>
              <CardTitle className="text-base">Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{name}</h3>
                  <Badge variant="outline">
                    {type.replace("_", " ")}
                  </Badge>
                  {industry && (
                    <Badge variant="secondary">{industry}</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{description}</p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="mt-4 flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating..." : "Create Scenario"}
          </Button>
        </div>
      </form>
    </div>
  );
}

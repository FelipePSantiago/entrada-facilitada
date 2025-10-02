"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Percent, Sparkles } from "lucide-react";

interface SinalCampaignToggleProps {
  isSinalCampaignActive: boolean;
  onCheckedChange: (checked: boolean) => void;
  sinalCampaignLimitPercent: number | null;
  onLimitChange: (value: number | null) => void;
}

export function SinalCampaignToggle({
  isSinalCampaignActive,
  onCheckedChange,
  sinalCampaignLimitPercent,
  onLimitChange,
}: SinalCampaignToggleProps) {
  return (
    <div id="sinal-campaign-section" className="flex flex-col gap-2">
      <div className="flex items-center space-x-2">
        <Switch
          id="sinal-campaign"
          checked={isSinalCampaignActive}
          onCheckedChange={onCheckedChange}
        />
        <Label htmlFor="sinal-campaign" className="flex items-center gap-1">
          <Sparkles className="h-4 w-4 text-yellow-500" /> CAMPANHA SINAL
        </Label>
      </div>
      {isSinalCampaignActive && (
        <div className="animate-in fade-in-50 space-y-1">
          <Label
            htmlFor="campaign-limit"
            className="text-xs text-muted-foreground"
          >
            Limite do Bônus (%)
          </Label>
          <div className="relative">
            <Input
              id="campaign-limit"
              type="number"
              value={sinalCampaignLimitPercent === null ? "" : sinalCampaignLimitPercent}
              onChange={(e) => {
                const value = e.target.value;
                onLimitChange(value === "" ? null : Number(value));
              }}
              className="h-8 pl-4 pr-7"
              placeholder="Ex: 10"
            />
            <Percent className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      )}
    </div>
  );
}

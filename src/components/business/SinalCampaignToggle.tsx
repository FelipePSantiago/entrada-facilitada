'use client';

import { Percent, Sparkles } from "lucide-react";
import { useFormContext } from 'react-hook-form'; // Correct import path
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { FormField, FormItem, FormControl } from "@/components/ui/form";

interface SinalCampaignToggleProps {
  isActive: boolean;
  setIsActive: (isActive: boolean) => void;
}

export function SinalCampaignToggle({ isActive, setIsActive }: SinalCampaignToggleProps) {
  const { control } = useFormContext();

  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div id="sinal-campaign-section" className="flex flex-col gap-4">
          <div className="flex flex-row items-center justify-between rounded-lg space-y-0">
            <Label
              htmlFor="sinal-campaign"
              className="flex items-center gap-2 cursor-pointer font-semibold"
            >
              <Sparkles className="h-5 w-5 text-yellow-500" />
              <span>CAMPANHA SINAL</span>
            </Label>
            <Switch
              checked={isActive}
              onCheckedChange={setIsActive}
              id="sinal-campaign"
            />
          </div>

          {isActive && (
            <div className="animate-in fade-in-50 space-y-2 pl-1">
              <FormField
                control={control}
                name="sinalCampaignLimitPercent"
                render={({ field }) => (
                  <FormItem>
                    <Label
                      htmlFor="campaign-limit"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Limite do Bônus (%)
                    </Label>
                    <FormControl>
                      <div className="relative">
                        <Input
                          {...field}
                          id="campaign-limit"
                          type="number"
                          onChange={(e) => {
                            const value = e.target.value;
                            field.onChange(value === "" ? null : Number(value));
                          }}
                          value={field.value ?? ""}
                          className="h-9 pl-3 pr-8"
                          placeholder="Ex: 10"
                        />
                        <Percent className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
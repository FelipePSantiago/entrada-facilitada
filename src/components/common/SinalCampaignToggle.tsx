"use client";

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Percent, Sparkles } from "lucide-react";
import { useFormContext } from "react-hook-form";

// This component is now fully controlled by a parent react-hook-form FormProvider.
export function SinalCampaignToggle() {
  const { control, watch } = useFormContext();

  const isSinalCampaignActive = watch("isSinalCampaignActive");

  return (
    <div id="sinal-campaign-section" className="flex flex-col gap-2">
      <FormField
        control={control}
        name="isSinalCampaignActive"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center space-x-2 space-y-0">
            <FormControl>
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
                id="sinal-campaign"
              />
            </FormControl>
            <Label htmlFor="sinal-campaign" className="flex items-center gap-1 cursor-pointer">
              <Sparkles className="h-4 w-4 text-yellow-500" /> CAMPANHA SINAL
            </Label>
          </FormItem>
        )}
      />

      {isSinalCampaignActive && (
        <div className="animate-in fade-in-50 space-y-1">
          <FormField
            control={control}
            name="sinalCampaignLimitPercent"
            render={({ field }) => (
              <FormItem>
                <Label
                  htmlFor="campaign-limit"
                  className="text-xs text-muted-foreground"
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
                        // Important: Pass null for empty string, and number for valid input
                        field.onChange(value === "" ? null : Number(value));
                      }}
                      // Handle null value from the form state
                      value={field.value ?? ""}
                      className="h-8 pl-4 pr-7"
                      placeholder="Ex: 10"
                    />
                    <Percent className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  </div>
                </FormControl>
              </FormItem>
            )}
          />
        </div>
      )}
    </div>
  );
}
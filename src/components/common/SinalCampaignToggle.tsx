// src/components/common/SinalCampaignToggle.tsx
"use client";
import { useFormContext } from "react-hook-form";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Info, TrendingUp } from "lucide-react";

export function SinalCampaignToggle() {
  const { watch, setValue } = useFormContext();
  const isSinalCampaignActive = watch("isSinalCampaignActive");
  const sinalCampaignLimitPercent = watch("sinalCampaignLimitPercent");
  
  const handleToggle = (checked: boolean) => {
    setValue("isSinalCampaignActive", checked);
    
    // Se ativou a campanha, define um valor padrão para o limite
    if (checked && !sinalCampaignLimitPercent) {
      setValue("sinalCampaignLimitPercent", 5);
    }
  };
  
  const handleLimitChange = (value: string) => {
    const numValue = parseInt(value);
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 100) {
      setValue("sinalCampaignLimitPercent", numValue);
    }
  };
  
  return (
    <Card className="w-full">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-base font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Campanha de Sinal
            </Label>
            <p className="text-sm text-muted-foreground">
              Ativar condições especiais para entrada reduzida
            </p>
          </div>
          <Switch
            checked={isSinalCampaignActive}
            onCheckedChange={handleToggle}
          />
        </div>
        
        {isSinalCampaignActive && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Esta campanha permite reduzir o valor mínimo de entrada para os clientes.
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <Label htmlFor="limit-percent" className="text-sm">
                Limite de Entrada (%)
              </Label>
              <div className="flex items-center gap-1">
                <Input
                  id="limit-percent"
                  type="number"
                  min="0"
                  max="100"
                  value={sinalCampaignLimitPercent || ""}
                  onChange={(e) => handleLimitChange(e.target.value)}
                  className="w-16 h-8 text-center"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
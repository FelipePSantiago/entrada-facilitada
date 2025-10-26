import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Wallet, PiggyBank, CreditCard, ShieldCheck, AlertCircle } from "lucide-react";
import { centsToBrl } from "@/lib/utils";
import dynamic from "next/dynamic";
import type { Results, FormValues } from "@/types";
import { PaymentTimeline } from "./payment-timeline";
import type { ChartData } from "./result-chart";

const ResultChart = dynamic(() => import('@/components/business/result-chart').then(mod => mod.ResultChart), { ssr: false });

interface ResultsDisplayProps {
  results: Results;
  brokerData: { name: string; creci: string };
  setBrokerData: React.Dispatch<React.SetStateAction<{ name: string; creci: string }>>;
  formValues: FormValues;
}

const SummaryCard = ({ icon, title, value, colorClass }: { icon: React.ReactNode, title: string, value: string, colorClass: string }) => (
    <Card className="flex flex-col justify-between">
        <CardHeader className="pb-2">
            <div className={`p-2 bg-muted rounded-md w-min ${colorClass}`}>
                {icon}
            </div>
        </CardHeader>
        <CardContent>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
        </CardContent>
    </Card>
);

export const ResultsDisplay = ({ results, brokerData, setBrokerData, formValues }: ResultsDisplayProps) => {
  if (!results) return null;

  const chartData: ChartData[] = [
    { name: "Entrada", value: results.totalEntryCost || 0 },
    { name: "Pró-Soluto", value: results.totalProSolutoCost || 0 },
    { name: "Cartório", value: results.totalNotaryCost || 0 },
    { name: "Seguro", value: results.totalInsuranceCost || 0 }
  ].filter(item => item.value > 0);

  return (
    <div className="space-y-6 pt-6">
      <Card>
        <CardHeader>
          <CardTitle>Resultados da Simulação</CardTitle>
          <CardDescription>Esta é uma visão geral dos custos e do fluxo de pagamento.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Chart on the left */}
            <div className="lg:col-span-1 flex items-center justify-center">
                <ResultChart data={chartData} value={results.totalCost || 0} />
            </div>

            {/* Summary Cards on the right */}
            <div className="grid grid-cols-2 gap-4 lg:col-span-2">
                <SummaryCard icon={<Wallet size={24} />} title="Custo Total" value={centsToBrl((results.totalCost || 0) * 100)} colorClass="text-primary" />
                <SummaryCard icon={<PiggyBank size={24} />} title="Entrada" value={centsToBrl((results.totalEntryCost || 0) * 100)} colorClass="text-green-500" />
                <SummaryCard icon={<CreditCard size={24} />} title="Pró-Soluto" value={centsToBrl((results.totalProSolutoCost || 0) * 100)} colorClass="text-purple-500" />
                <SummaryCard icon={<ShieldCheck size={24} />} title="Seguro Obra" value={centsToBrl((results.totalConstructionInsurance || 0) * 100)} colorClass="text-orange-500" />
            </div>
          </div>

          {/* Stepped Installments Table */}
          {results.steppedInstallments && results.steppedInstallments.length > 0 && (
            <div className="pt-4 border-t">
              <h4 className="font-semibold mb-2 text-lg">Detalhamento das Parcelas Escalonadas</h4>
              <Table>
                <TableHeader><TableRow><TableHead>Período</TableHead><TableHead>Nº Parcelas</TableHead><TableHead className="text-right">Valor da Parcela</TableHead></TableRow></TableHeader>
                <TableBody>
                  {results.steppedInstallments.map((installment, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{index + 1}º Período</TableCell>
                      <TableCell>{results.periodLengths?.[index] || 'N/A'}</TableCell>
                      <TableCell className="text-right">{centsToBrl(installment * 100)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Validation & Commitment Alerts */}
          {(results.incomeError || results.proSolutoError) && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Alerta de Comprometimento de Renda</AlertTitle>
              <AlertDescription>
                {results.incomeError && <p>{results.incomeError}</p>}
                {results.proSolutoError && <p>{results.proSolutoError}</p>}
              </AlertDescription>
            </Alert>
          )}
          
          {/* Broker Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-6 border-t">
            <div>
                <Input placeholder="Nome do Corretor" value={brokerData.name} onChange={(e) => setBrokerData(prev => ({...prev, name: e.target.value}))} />
                <p className="text-xs text-muted-foreground mt-1">Opcional: para gerar o PDF com os seus dados.</p>
            </div>
             <div>
                <Input placeholder="CRECI" value={brokerData.creci} onChange={(e) => setBrokerData(prev => ({...prev, creci: e.target.value}))} />
                 <p className="text-xs text-muted-foreground mt-1">Opcional: o seu CRECI será exibido no PDF.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <PaymentTimeline results={results} formValues={formValues} />
    </div>
  );
};
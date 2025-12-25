"use client";

import React, { useState, useMemo, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { Property, UnitStatus, Tower, Floor, Unit } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { httpsCallable } from 'firebase/functions';


interface AvailabilityManagerProps {
    property: Property;
}

const statusOptions: UnitStatus[] = ["Disponível", "Reservado", "Vendido", "Indisponível"];

export function AvailabilityManager({ property }: AvailabilityManagerProps) {
    const { toast } = useToast();
    const { user, functions } = useAuth();
    const [isUpdating, setIsUpdating] = useState<Record<string, boolean>>({});
    const [isBatchUpdating, setIsBatchUpdating] = useState(false);
    const availabilityExcelInputRef = useRef<HTMLInputElement>(null);

    const allUnits = useMemo(() => {
        return (property.availability?.towers?.flatMap((tower: Tower) => // Explicitly type tower
            tower.floors.flatMap((floor: Floor) =>
                floor.units.map((unit: Unit): Unit & { towerName: string; floorName: string } => // Explicitly type the returned object
                    ({
                        ...unit,
                        towerName: tower.tower,
                        floorName: floor.floor
                    })
                )
            )
        ) || []);
    }, [property.availability]); // Added closing parenthesis for the inner flatMap call and wrapping the entire chain

    const handleStatusChange = async (unitId: string, newStatus: UnitStatus) => { // Added closing parenthesis for the inner flatMap call and wrapping the entire chain
        if (!user || !functions) {
            toast({ variant: 'destructive', title: '❌ Erro de Autenticação', description: 'Por favor, faça login novamente.' });
            return;
        }
        setIsUpdating(prev => ({ ...prev, [unitId]: true }));
        try {
            const idToken = await user.getIdToken(true);
            const handleUnitStatusChange = httpsCallable(functions, 'handleUnitStatusChangeAction');
            await handleUnitStatusChange({ propertyId: property.id, unitId, newStatus, idToken });
            toast({
                title: "✅ Status Atualizado!",
                description: `O status da unidade ${unitId} foi alterado para ${newStatus}.`,
            });
        } catch (error) {
            const err = error as Error;
            toast({
                variant: "destructive",
                title: "❌ Erro ao Atualizar",
                description: err.message || "Não foi possível alterar o status da unidade.",
            });
        } finally {
            setIsUpdating(prev => ({ ...prev, [unitId]: false }));
        }
    };

    const handleAvailabilityUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.[0] || !user || !functions) {
            toast({ variant: 'destructive', title: '❌ Erro de Autenticação', description: 'Por favor, faça login novamente.' });
            return;
        }

        setIsBatchUpdating(true);
        const file = e.target.files[0];

        try {
            const fileReader = new FileReader();
            fileReader.readAsBinaryString(file);

            const fileContent = await new Promise<string>((resolve, reject) => {
                fileReader.onload = (e) => {
                    if (!e.target || typeof e.target.result !== 'string') {
                        return reject(new Error('Não foi possível ler o arquivo.'));
                    }
                    resolve(e.target.result);
                };
                fileReader.onerror = () => reject(new Error('Falha ao ler o arquivo.\''));
            });


            const idToken = await user.getIdToken(true);
            const updatePropertyAvailability = httpsCallable(functions, 'updatePropertyAvailabilityAction');
            const result = await updatePropertyAvailability({ propertyId: property.id, fileContent, idToken });
            const { unitsUpdatedCount } = result.data as { unitsUpdatedCount: number };

            toast({ title: '✅ Disponibilidade Atualizada!', description: `Status de ${unitsUpdatedCount} unidades foram processados.` });

        } catch (error: unknown) {
            const err = error as Error;
            toast({ variant: "destructive", title: "❌ Erro na Análise da Planilha", description: err.message });
        } finally {
            setIsBatchUpdating(false);
            if (availabilityExcelInputRef.current) {
                availabilityExcelInputRef.current.value = "";
            }
        }
    };

    return (
        <div className="p-4 bg-muted/50 rounded-lg space-y-4">
             <div className="p-4 border-2 border-dashed rounded-lg">
                <div className="text-center">
                    <h3 className="font-semibold">Atualizar em Lote</h3>
                    <p className="text-sm text-muted-foreground">Envie uma planilha Excel (.xlsx) com as colunas "Unidade" e "Disponibilidade".</p>
                </div>
                <div className="mt-4">
                    <input
                        type="file"
                        accept=".xlsx"
                        ref={availabilityExcelInputRef}
                        onChange={handleAvailabilityUpload}
                        className="hidden"
                    />
                    <Button
                        size="lg"
                        className="w-full"
                        onClick={() => availabilityExcelInputRef.current?.click()}
                        disabled={isBatchUpdating}
                    >
                        {isBatchUpdating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <FileSpreadsheet className="mr-2 h-5 w-5" />}
                        {isBatchUpdating ? "Atualizando..." : "Carregar Disponibilidade (Excel)"}
                    </Button>
                </div>
            </div>

            <div>
                <h4 className="font-medium text-sm mb-2">Gerenciamento Manual</h4>
                <div className="max-h-96 overflow-y-auto border rounded-md">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Unidade</TableHead>
                                <TableHead>Torre/Bloco</TableHead>
                                <TableHead>Andar</TableHead>
                                <TableHead className="w-[200px]">Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {/* Iterate over allUnits which now includes towerName and floorName */}
                            {allUnits.map((unit) => ( // Explicitly type unit
                                <TableRow key={unit.unitId}> 
                                    <TableCell>{unit.unitNumber}</TableCell>
                                    {/* Access towerName and floorName directly */}
                                    <TableCell>{unit.towerName}</TableCell>
                                    <TableCell>{unit.floorName}</TableCell>
                                    <TableCell>
                                        {isUpdating[unit.unitId] ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Select
                                                value={unit.status}
                                                onValueChange={(newStatus) => handleStatusChange(unit.unitId, newStatus as UnitStatus)}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {statusOptions.map(opt => (
                                                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    );
}
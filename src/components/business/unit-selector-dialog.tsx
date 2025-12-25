'use client';

import React, { useMemo, useRef, useState, useEffect, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Grid3X3,
  Car,
  Sun,
  Ruler,
  Tag,
  Filter,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import type { CombinedUnit, UnitStatus, Property } from "@/types";
import { cn } from "@/lib/utils";
import { centsToBrl } from "@/lib/business/formatters";

// --- Internal Components ---

interface VirtualRow {
  index: number;
  key: React.Key;
  size: number;
  start: number;
}

const getStatusBadgeClass = (status: UnitStatus) => {
  switch (status) {
    case 'Disponível':
      return 'border-primary/50 bg-primary/10 text-primary hover:shadow-lg hover:border-primary';
    case 'Vendido':
      return 'border-destructive/50 bg-destructive/10 text-destructive opacity-60 cursor-not-allowed';
    case 'Reservado':
      return 'border-yellow-500/50 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 opacity-80 cursor-not-allowed';
    case 'Indisponível':
      return 'border-muted-foreground/50 bg-muted/80 text-muted-foreground opacity-60 cursor-not-allowed';
    default:
      return 'border-border bg-muted/80';
  }
};

const useResponsiveColumns = () => {
    const [columns, setColumns] = useState(1);
    useEffect(() => {
        const getColumns = (width: number) => {
            if (width < 640) return 1; 
            if (width < 768) return 2;
            if (width < 1024) return 3;
            if (width < 1280) return 4;
            return 5;
        };
        const handleResize = () => setColumns(getColumns(window.innerWidth));
        window.addEventListener('resize', handleResize);
        handleResize();
        return () => window.removeEventListener('resize', handleResize);
    }, []);
    return columns;
};

const UnitCard = memo(({ unit, isReservaParque, onUnitSelect }: { unit: CombinedUnit; isReservaParque: boolean; onUnitSelect: (unit: CombinedUnit) => void; }) => {
    const unitDisplay = isReservaParque ? `Torre ${unit.block}` : `Bloco ${unit.block}`;
    const handleClick = () => {
        if (unit.status === 'Disponível') {
            onUnitSelect(unit);
        }
    };
    
    return (
        <div>
            <Card 
                className={cn(
                    "cursor-pointer transition-all duration-200 shadow-sm border rounded-lg overflow-hidden group h-full flex flex-col",
                    getStatusBadgeClass(unit.status),
                    unit.status === 'Disponível' && 'hover:shadow-xl hover:-translate-y-1'
                )}
                onClick={handleClick}
            >
                <CardHeader className="p-4 pb-2 flex-row justify-between items-start">
                    <div>
                        <p className="font-bold text-base text-card-foreground">{unitDisplay}</p>
                        <p className="font-semibold text-sm text-primary">Unidade {unit.unitNumber}</p>
                        <p className="text-xs text-muted-foreground">{unit.floor}</p>
                    </div>
                    <div className={cn("text-xs font-bold px-2 py-1 rounded-full", getStatusBadgeClass(unit.status).replace(/hover:[a-z-]+/g, ''))}>
                        {unit.status}
                    </div>
                </CardHeader>
                <CardContent className="p-4 pt-2 text-xs space-y-1.5 flex-grow">
                    <div className="flex justify-between items-baseline pt-2">
                        <span className="font-semibold text-muted-foreground">Venda:</span>
                        <span className="font-bold text-lg text-primary">{centsToBrl(unit.saleValue)}</span>
                    </div>
                    <Separator className="my-2"/>
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Grid3X3 className="h-4 w-4 text-primary/70"/> 
                        <strong className="text-card-foreground/80">Tipologia:</strong> {unit.typology}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Ruler className="h-4 w-4 text-primary/70"/> 
                        <strong className="text-card-foreground/80">Área:</strong> {(unit.privateArea).toFixed(2)}m²
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Sun className="h-4 w-4 text-primary/70"/> 
                        <strong className="text-card-foreground/80">Sol:</strong> {unit.sunPosition}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Car className="h-4 w-4 text-primary/70"/> 
                        <strong className="text-card-foreground/80">Vagas:</strong> {unit.parkingSpaces}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Tag className="h-4 w-4 text-primary/70"/> 
                        <strong className="text-card-foreground/80">Avaliação:</strong> {centsToBrl(unit.appraisalValue)}
                    </div>
                     <div className="flex items-center gap-2 text-muted-foreground">
                        <Tag className="h-4 w-4 text-primary/70"/> 
                        <strong className="text-card-foreground/80">Bônus:</strong> {centsToBrl(unit.complianceBonus)}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
});
UnitCard.displayName = 'UnitCard';

export const UnitSelectorDialogContent = ({
  allUnits,
  filteredUnits,
  isReservaParque,
  onUnitSelect,
  filters,
  filterOptions,
}: {
  allUnits: CombinedUnit[];
  filteredUnits: CombinedUnit[];
  isReservaParque: boolean;
  onUnitSelect: (unit: CombinedUnit) => void;
  filters: {
    status: UnitStatus | 'Todos';
    setStatus: (s: UnitStatus | 'Todos') => void;
    floor: string;
    setFloor: (f: string) => void;
    typology: string;
    setTypology: (t: string) => void;
    sunPosition: string;
    setSunPosition: (s: string) => void;
  };
  filterOptions: {
    floors: string[];
    typologies: string[];
    sunPositions: string[];
  };
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const columns = useResponsiveColumns();

  const unitCounts = useMemo(() => {
    return allUnits.reduce((acc, unit) => {
      acc.total++;
      if (unit.status === 'Disponível') acc.disponivel++;
      else if (unit.status === 'Vendido') acc.vendido++;
      else if (unit.status === 'Reservado') acc.reservado++;
      else if (unit.status === 'Indisponível') acc.indisponivel++;
      return acc;
    }, { total: 0, disponivel: 0, vendido: 0, reservado: 0, indisponivel: 0 });
  }, [allUnits]);

  const rowVirtualizer = useVirtualizer({
    count: Math.ceil(filteredUnits.length / columns),
    getScrollElement: () => parentRef.current,
    estimateSize: () => 320,
    overscan: 5,
  });

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex-shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Selecione uma Unidade</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Use os filtros para encontrar a unidade desejada e clique para selecioná-la.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 border-b p-4">
        <Accordion type="single" collapsible defaultValue="filters" className="w-full">
          <AccordionItem value="filters" className="border-none">
            <AccordionTrigger className="py-2 hover:no-underline">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                <span className="font-semibold">Filtros e Estatísticas</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-1">
                <Select value={filters.status} onValueChange={(v) => filters.setStatus(v as UnitStatus | 'Todos')}>
                  <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Todos">Todos os Status</SelectItem>
                    <SelectItem value="Disponível">Disponível</SelectItem>
                    <SelectItem value="Reservado">Reservado</SelectItem>
                    <SelectItem value="Vendido">Vendido</SelectItem>
                    <SelectItem value="Indisponível">Indisponível</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filters.floor} onValueChange={filters.setFloor}>
                  <SelectTrigger><SelectValue placeholder="Andar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Todos">Todos os Andares</SelectItem>
                    {filterOptions.floors.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filters.typology} onValueChange={filters.setTypology}>
                  <SelectTrigger><SelectValue placeholder="Tipologia" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Todos">Todas as Tipologias</SelectItem>
                    {filterOptions.typologies.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filters.sunPosition} onValueChange={filters.setSunPosition}>
                  <SelectTrigger><SelectValue placeholder="Posição Solar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Todos">Todas as Posições</SelectItem>
                    {filterOptions.sunPositions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Card className="p-3 mt-4">
                <div className="grid grid-cols-2 sm:grid-cols-5 text-center text-xs gap-2">
                  <div className="font-bold">Total: <span className="text-primary">{unitCounts.total}</span></div>
                  <div className="font-bold">Disponíveis: <span className="text-green-600">{unitCounts.disponivel}</span></div>
                  <div className="font-bold">Vendidos: <span className="text-red-600">{unitCounts.vendido}</span></div>
                  <div className="font-bold">Reservados: <span className="text-yellow-600">{unitCounts.reservado}</span></div>
                  <div className="font-bold">Indisponíveis: <span className="text-gray-600">{unitCounts.indisponivel}</span></div>
                </div>
              </Card>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <div ref={parentRef} className="flex-grow overflow-y-auto p-4" style={{ height: 'calc(100vh - 200px)', minHeight: '400px' }}>
        <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow: VirtualRow) => {
            const unitsInRow = filteredUnits.slice(virtualRow.index * columns, (virtualRow.index * columns) + columns);
            return (
              <div
                key={virtualRow.key}
                style={{
                  position: 'absolute', top: 0, left: 0, width: '100%',
                  height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)`,
                  display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: '1rem', paddingBottom: '1rem'
                }}
              >
                {unitsInRow.map((unit) => <UnitCard key={unit.unitId} unit={unit} isReservaParque={isReservaParque} onUnitSelect={onUnitSelect}/>)}
              </div>
            );
          })}
        </div>
        
        {filteredUnits.length === 0 && (
          <div className="text-center py-10 text-muted-foreground">
            <p className="text-lg font-medium mb-2">Nenhuma unidade encontrada</p>
            <p className="text-sm">Não foram encontradas unidades com os filtros selecionados.</p>
          </div>
        )}
      </div>
    </div>
  );
};

// --- Main Exported Component ---

interface UnitSelectorDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  units: CombinedUnit[];
  onUnitSelect: (unit: CombinedUnit) => void;
  selectedProperty: Property | null;
}

export function UnitSelectorDialog({ isOpen, onOpenChange, units, onUnitSelect, selectedProperty }: UnitSelectorDialogProps) {
  // Filter states
  const [status, setStatus] = useState<UnitStatus | 'Todos'>('Disponível');
  const [floor, setFloor] = useState('Todos');
  const [typology, setTypology] = useState('Todos');
  const [sunPosition, setSunPosition] = useState('Todos');

  const isReservaParque = useMemo(() => selectedProperty?.brand === 'Reserva Parque', [selectedProperty]);

  // Reset filters when dialog is opened or units change
  useEffect(() => {
    if (isOpen) {
      setStatus('Disponível');
      setFloor('Todos');
      setTypology('Todos');
      setSunPosition('Todos');
    }
  }, [isOpen, units]);

  // Memoized filter options
  const filterOptions = useMemo(() => {
    const floors = [...new Set(units.map(u => u.floor))].sort((a, b) => a.localeCompare(b));
    const typologies = [...new Set(units.map(u => u.typology))].sort();
    const sunPositions = [...new Set(units.map(u => u.sunPosition))].sort();
    return { floors, typologies, sunPositions };
  }, [units]);

  // Memoized filtered units
  const filteredUnits = useMemo(() => {
    return units.filter(unit => {
      if (status !== 'Todos' && unit.status !== status) return false;
      if (floor !== 'Todos' && unit.floor !== floor) return false;
      if (typology !== 'Todos' && unit.typology !== typology) return false;
      if (sunPosition !== 'Todos' && unit.sunPosition !== sunPosition) return false;
      return true;
    });
  }, [units, status, floor, typology, sunPosition]);

  const handleUnitSelectAndClose = (unit: CombinedUnit) => {
    onUnitSelect(unit);
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl h-[90vh] flex flex-col p-0">
        <UnitSelectorDialogContent
          allUnits={units}
          filteredUnits={filteredUnits}
          isReservaParque={isReservaParque}
          onUnitSelect={handleUnitSelectAndClose}
          filters={{ status, setStatus, floor, setFloor, typology, setTypology, sunPosition, setSunPosition }}
          filterOptions={filterOptions}
        />
      </DialogContent>
    </Dialog>
  );
}
// src/components/business/unit-selector-dialog.tsx
"use client";
import React, { useState, useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  Building, 
  MapPin, 
  Home, 
  Square, 
  Bed, 
  Bath, 
  Car,
  Filter,
  Check
} from 'lucide-react';

interface Unit {
  id: string;
  name: string;
  address: string;
  type: string;
  area: number;
  bedrooms: number;
  bathrooms: number;
  parkingSpaces: number;
  price: number;
  available: boolean;
}

interface UnitSelectorDialogProps {
  children: React.ReactNode;
  onUnitSelect: (unit: Unit) => void;
  selectedUnitId?: string;
}

export function UnitSelectorDialog({ 
  children, 
  onUnitSelect, 
  selectedUnitId 
}: UnitSelectorDialogProps) {
  const [open, setOpen] = useState(false);
  const [units, setUnits] = useState<Unit[]>([]);
  const [filteredUnits, setFilteredUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  
  useEffect(() => {
    const fetchUnits = async () => {
      setLoading(true);
      
      try {
        const mockUnits: Unit[] = [
          {
            id: "1",
            name: "Apto 101",
            address: "Rua das Flores, 123 - Centro",
            type: "apartamento",
            area: 65,
            bedrooms: 2,
            bathrooms: 1,
            parkingSpaces: 1,
            price: 350000,
            available: true,
          },
          {
            id: "2",
            name: "Apto 202",
            address: "Rua das Flores, 123 - Centro",
            type: "apartamento",
            area: 85,
            bedrooms: 3,
            bathrooms: 2,
            parkingSpaces: 2,
            price: 450000,
            available: true,
          },
          {
            id: "3",
            name: "Casa 01",
            address: "Rua das Árvores, 456 - Jardim",
            type: "casa",
            area: 120,
            bedrooms: 3,
            bathrooms: 2,
            parkingSpaces: 2,
            price: 650000,
            available: true,
          },
          {
            id: "4",
            name: "Apto 305",
            address: "Avenida Principal, 789 - Nova",
            type: "apartamento",
            area: 75,
            bedrooms: 2,
            bathrooms: 2,
            parkingSpaces: 1,
            price: 420000,
            available: false,
          },
          {
            id: "5",
            name: "Casa 05",
            address: "Rua das Árvores, 456 - Jardim",
            type: "casa",
            area: 150,
            bedrooms: 4,
            bathrooms: 3,
            parkingSpaces: 3,
            price: 850000,
            available: true,
          },
        ];
        
        setUnits(mockUnits);
        setFilteredUnits(mockUnits);
        
        if (selectedUnitId) {
          const unit = mockUnits.find(u => u.id === selectedUnitId);
          if (unit) setSelectedUnit(unit);
        }
      } catch (error) {
        console.error("Erro ao carregar unidades:", error);
      } finally {
        setLoading(false);
      }
    };
    
    if (open) {
      fetchUnits();
    }
  }, [open, selectedUnitId]);
  
  useEffect(() => {
    let filtered = units;
    
    if (searchTerm) {
      filtered = filtered.filter(unit => 
        unit.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        unit.address.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (selectedType !== "all") {
      filtered = filtered.filter(unit => unit.type === selectedType);
    }
    
    setFilteredUnits(filtered);
  }, [units, searchTerm, selectedType]);
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };
  
  const getUnitTypeIcon = (type: string) => {
    return type === "casa" ? <Home className="h-4 w-4" /> : <Building className="h-4 w-4" />;
  };
  
  const getUnitTypeText = (type: string) => {
    return type === "casa" ? "Casa" : "Apartamento";
  };
  
  const handleSelectUnit = (unit: Unit) => {
    setSelectedUnit(unit);
  };
  
  const handleConfirmSelection = () => {
    if (selectedUnit) {
      onUnitSelect(selectedUnit);
      setOpen(false);
    }
  };
  
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {children}
      </AlertDialogTrigger>
      <AlertDialogContent className="sm:max-w-[800px] max-h-[80vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Building className="h-5 w-5" />
            Selecionar Unidade
          </AlertDialogTitle>
          <AlertDialogDescription>
            Escolha uma unidade para simular o financiamento
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Buscar por nome ou endereço..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <div className="flex gap-2">
              <Button
                variant={selectedType === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedType("all")}
              >
                Todos
              </Button>
              <Button
                variant={selectedType === "apartamento" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedType("apartamento")}
              >
                Apartamentos
              </Button>
              <Button
                variant={selectedType === "casa" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedType("casa")}
              >
                Casas
              </Button>
            </div>
          </div>
          
          <div className="space-y-3">
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : filteredUnits.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Nenhuma unidade encontrada com os filtros selecionados.
              </div>
            ) : (
              filteredUnits.map((unit) => (
                <div
                  key={unit.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedUnit?.id === unit.id
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                  } ${!unit.available ? "opacity-60" : ""}`}
                  onClick={() => unit.available && handleSelectUnit(unit)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">{unit.name}</h3>
                        <Badge variant="outline" className="flex items-center gap-1">
                          {getUnitTypeIcon(unit.type)}
                          {getUnitTypeText(unit.type)}
                        </Badge>
                        {!unit.available && (
                          <Badge variant="destructive">Indisponível</Badge>
                        )}
                        {selectedUnit?.id === unit.id && (
                          <Badge className="bg-blue-600">
                            <Check className="h-3 w-3 mr-1" />
                            Selecionado
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 mb-2">
                        <MapPin className="h-3 w-3" />
                        {unit.address}
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1">
                          <Square className="h-3 w-3" />
                          {unit.area}m²
                        </div>
                        
                        <div className="flex items-center gap-1">
                          <Bed className="h-3 w-3" />
                          {unit.bedrooms} quartos
                        </div>
                        
                        <div className="flex items-center gap-1">
                          <Bath className="h-3 w-3" />
                          {unit.bathrooms} banheiros
                        </div>
                        
                        <div className="flex items-center gap-1">
                          <Car className="h-3 w-3" />
                          {unit.parkingSpaces} vagas
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-lg font-bold">
                        {formatCurrency(unit.price)}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleConfirmSelection}
              disabled={!selectedUnit || !selectedUnit.available}
            >
              Confirmar Seleção
            </Button>
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

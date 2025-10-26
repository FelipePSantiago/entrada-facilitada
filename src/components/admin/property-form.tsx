"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import type { Property, PropertyFormValues } from "@/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSavePropertyAction } from "@/actions";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";


const formSchema = z.object({
  id: z.string().min(1, { message: "O ID é obrigatório." }).regex(/^[a-z0-9-]+$/, { message: "ID deve conter apenas letras minúsculas, números e hífens."}),
  enterpriseName: z.string().min(1, { message: "O nome é obrigatório." }),
  brand: z.enum(["Riva", "Direcional"]),
  constructionStartDate: z.string().optional(),
  deliveryDate: z.string().optional(),
});

interface PropertyFormProps {
  initialData?: Property | null;
  onCancel: () => void;
  isSubmitting: boolean;
  setIsSubmitting: (isSubmitting: boolean) => void;
}

export function PropertyForm({ initialData, onCancel, isSubmitting, setIsSubmitting }: PropertyFormProps) {
  const { user, functions } = useAuth();
  const { toast } = useToast();

  const form = useForm<PropertyFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      id: "",
      enterpriseName: "",
      brand: "Riva",
      constructionStartDate: "",
      deliveryDate: "",
    },
  });

   useEffect(() => {
    if (initialData) {
      form.reset({
        ...initialData,
        constructionStartDate: initialData.constructionStartDate || "",
        deliveryDate: initialData.deliveryDate || "",
      });
    } else {
      form.reset({
        id: "",
        enterpriseName: "",
        brand: "Riva",
        constructionStartDate: "",
        deliveryDate: "",
      });
    }
  }, [initialData, form]);
  
  const handleFormSubmit = async (values: PropertyFormValues) => {
    if (!user || !functions) {
      toast({ variant: "destructive", title: "Erro de autenticação" });
      return;
    }
    setIsSubmitting(true);
    try {
      const idToken = await user.getIdToken(true);
      const dataToSubmit = {
          ...values,
          idToken,
          constructionStartDate: values.constructionStartDate || "",
          deliveryDate: values.deliveryDate || "",
      };
      const savePropertyAction = getSavePropertyAction(functions);
      await savePropertyAction(dataToSubmit);
      onCancel(); // Fecha o modal após o sucesso
    } catch (error) {
      const err = error as Error;
      toast({ variant: "destructive", title: "Erro ao salvar", description: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    form.setValue('enterpriseName', name, { shouldValidate: true });

    if (!initialData) { 
        const newId = name
            .toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
            .replace(/[^a-z0-9\s-]/g, '') 
            .trim()
            .replace(/\s+/g, '-'); 
        form.setValue('id', newId, { shouldValidate: true });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <FormField
            control={form.control}
            name="enterpriseName"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Nome do Empreendimento</FormLabel>
                <FormControl>
                    <Input 
                      placeholder="Residencial das Flores" 
                      {...field}
                      onChange={handleNameChange} 
                    />
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
            />
            <FormField
            control={form.control}
            name="brand"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Marca</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || "Riva"} defaultValue={field.value || "Riva"}>
                    <FormControl>
                    <SelectTrigger>
                        <SelectValue placeholder="Selecione a marca" />
                    </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                        <SelectItem value="Riva">Riva</SelectItem>
                        <SelectItem value="Direcional">Direcional</SelectItem>
                    </SelectContent>
                </Select>
                <FormMessage />
                </FormItem>
            )}
            />
        </div>
        <FormField
          control={form.control}
          name="id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>ID do Empreendimento (automático)</FormLabel>
              <FormControl>
                <Input placeholder="residencial-das-flores" {...field} readOnly className="bg-muted"/>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <FormField
            control={form.control}
            name="constructionStartDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Data de Início das Obras</FormLabel>
                <DatePicker 
                    value={field.value} 
                    onChange={field.onChange} 
                />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="deliveryDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Data de Entrega</FormLabel>
                <DatePicker 
                    value={field.value} 
                    onChange={field.onChange} 
                />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="flex justify-end gap-4 pt-4">
           <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {initialData ? 'Salvar Alterações' : 'Salvar Empreendimento'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

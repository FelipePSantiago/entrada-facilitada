
"use client";

import { useState, useEffect } from 'react';
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/clientApp";
import { useToast } from "@/hooks/use-toast";
import { LayoutDashboard, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function Header() {
    const { user, isAdmin, isFullyAuthenticated } = useAuth();
    const pathname = usePathname();
    const { toast } = useToast();
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const handleLogout = async () => {
        try {
            await signOut(auth);
            toast({
                title: "Logout bem-sucedido!",
                description: "Você foi desconectado.",
            });
        } catch {
             toast({
                variant: "destructive",
                title: "Erro no Logout",
                description: "Não foi possível fazer o logout. Tente novamente.",
            });
        }
    };
    
    const getInitials = (email: string) => {
        if (!email) return '?';
        return email[0].toUpperCase();
    };

    return (
        <header className="absolute top-0 left-0 w-full p-4 bg-background/80 backdrop-blur-sm shadow-sm z-10">
          <div className="container mx-auto flex justify-between items-center">
            <div className="flex-1">
               <Link href="/" className="text-2xl font-bold text-primary">
                    Simulador Riva
                </Link>
            </div>
            
            <div className="flex-1 flex justify-end items-center gap-4">
              {isMounted && isFullyAuthenticated && (
                <>
                  {isAdmin && (
                    <Button variant={pathname.startsWith('/admin') ? "secondary" : "ghost"} asChild>
                       <Link href="/admin/properties">
                        <LayoutDashboard className="mr-2 h-4 w-4" />
                         Admin
                       </Link>
                    </Button>
                  )}
                 <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                           <Avatar className="h-8 w-8">
                                <AvatarImage src={user?.photoURL || ''} alt={user?.displayName || 'Avatar'} />
                                <AvatarFallback>{getInitials(user?.email || '')}</AvatarFallback>
                            </Avatar>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56" align="end" forceMount>
                        <DropdownMenuLabel className="font-normal">
                          <div className="flex flex-col space-y-1">
                            <p className="text-sm font-medium leading-none">Minha Conta</p>
                            <p className="text-xs leading-none text-muted-foreground">
                              {user?.email}
                            </p>
                          </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleLogout}>
                          <LogOut className="mr-2 h-4 w-4" />
                          <span>Sair</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                 </DropdownMenu>
                </>
              )}
            </div>
          </div>
        </header>
    )
}

    



    
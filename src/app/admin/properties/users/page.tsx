'use client';

import { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { 
  Users, 
  UserPlus, 
  Shield, 
  ShieldCheck, 
  ShieldX, 
  KeyRound, 
  Trash2, 
  Edit,
  Eye,
  EyeOff,
  RefreshCw,
  Search,
  UserX,
  Mail,
  Lock,
  Unlock,
  AlertTriangle,
  Calendar,
  Clock,
  Ban,
  CheckCircle,
  Settings,
  ArrowLeft
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import Link from "next/link";

interface User {
  uid: string;
  email: string;
  emailLower: string;
  isAdmin: boolean;
  twoFactorEnabled: boolean;
  twoFactorURI?: string;
  twoFactorResetToken?: string;
  twoFactorResetExpires?: any;
  createdAt?: string;
  lastLoginAt?: string;
  isActive?: boolean;
  validUntil?: string;
  validityMonths?: number;
  deactivatedAt?: string;
  deactivationReason?: string;
}

interface CreateUserFormData {
  email: string;
  password: string;
  isAdmin: boolean;
  validityMonths?: number;
}

interface ResetPasswordFormData {
  newPassword: string;
  confirmPassword: string;
}

interface AccountValidityFormData {
  validityMonths?: number;
  validUntil?: string;
  removeValidity?: boolean;
}

// Função simples de retry para substituir a dependência faltante
const retryFirebaseFunction = async (fn: () => Promise<any>, functionName: string) => {
  try {
    return await fn();
  } catch (error) {
    console.error(`Error in ${functionName}:`, error);
    throw error;
  }
};

export default function AdminUsersPage() {
  const { user: currentUser, functions } = useAuth();
  const { toast } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showResetPasswordDialog, setShowResetPasswordDialog] = useState(false);
  const [showAccountValidityDialog, setShowAccountValidityDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [createFormData, setCreateFormData] = useState<CreateUserFormData>({
    email: '',
    password: '',
    isAdmin: false,
    validityMonths: undefined
  });
  const [resetFormData, setResetFormData] = useState<ResetPasswordFormData>({
    newPassword: '',
    confirmPassword: ''
  });
  const [accountValidityFormData, setAccountValidityFormData] = useState<AccountValidityFormData>({
    validityMonths: undefined,
    validUntil: '',
    removeValidity: false
  });

  const usersPerPage = 10;

  useEffect(() => {
    if (searchTerm) {
      setCurrentPage(1);
    }
  }, [searchTerm]);

  useEffect(() => {
    fetchUsers();
  }, [currentPage, searchTerm]);

  const fetchUsers = async () => {
    if (!functions) return;

    setLoading(true);
    try {
      const listUsers = httpsCallable(functions, 'listUsersAction');
      const result = await retryFirebaseFunction(
        () => listUsers({ page: currentPage, limit: usersPerPage }),
        'listUsersAction'
      );

      if (result.data && (result.data as any).success) {
        setUsers((result.data as any).users);
        setTotalUsers((result.data as any).total);
        setTotalPages(Math.ceil((result.data as any).total / usersPerPage));
      } else {
        toast({
          variant: 'destructive',
          title: 'Erro',
          description: (result.data as any)?.message || 'Falha ao carregar usuários'
        });
      }
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Falha ao carregar usuários'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!functions) return;

    if (createFormData.password.length < 6) {
      toast({
        variant: 'destructive',
        title: 'Erro de Validação',
        description: 'A senha deve ter pelo menos 6 caracteres'
      });
      return;
    }

    try {
      const createUser = httpsCallable(functions, 'createUserAction');
      const result = await retryFirebaseFunction(
        () => createUser(createFormData),
        'createUserAction'
      );

      if (result.data && (result.data as any).success) {
        toast({
          title: 'Sucesso',
          description: 'Usuário criado com sucesso'
        });
        setShowCreateDialog(false);
        setCreateFormData({ email: '', password: '', isAdmin: false, validityMonths: undefined });
        fetchUsers();
      } else {
        toast({
          variant: 'destructive',
          title: 'Erro',
          description: (result.data as any)?.message || 'Falha ao criar usuário'
        });
      }
    } catch (error) {
      console.error('Erro ao criar usuário:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Falha ao criar usuário'
      });
    }
  };

  const handleToggle2FA = async (user: User) => {
    if (!functions) return;

    try {
      const updateUserTwoFactor = httpsCallable(functions, 'updateUserTwoFactorAction');
      const result = await retryFirebaseFunction(
        () => updateUserTwoFactor({ uid: user.uid, twoFactorEnabled: !user.twoFactorEnabled }),
        'updateUserTwoFactorAction'
      );

      if (result.data && (result.data as any).success) {
        toast({
          title: 'Sucesso',
          description: `2FA ${!user.twoFactorEnabled ? 'ativado' : 'desativado'} com sucesso`
        });
        fetchUsers();
      } else {
        toast({
          variant: 'destructive',
          title: 'Erro',
          description: (result.data as any)?.message || 'Falha ao atualizar 2FA'
        });
      }
    } catch (error) {
      console.error('Erro ao atualizar 2FA:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Falha ao atualizar 2FA'
      });
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (!functions) return;

    if (!confirm(`Tem certeza que deseja excluir o usuário ${user.email}?`)) {
      return;
    }

    try {
      const deleteUser = httpsCallable(functions, 'deleteUserAction');
      const result = await retryFirebaseFunction(
        () => deleteUser({ uid: user.uid }),
        'deleteUserAction'
      );

      if (result.data && (result.data as any).success) {
        toast({
          title: 'Sucesso',
          description: 'Usuário excluído com sucesso'
        });
        fetchUsers();
      } else {
        toast({
          variant: 'destructive',
          title: 'Erro',
          description: (result.data as any)?.message || 'Falha ao excluir usuário'
        });
      }
    } catch (error) {
      console.error('Erro ao excluir usuário:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Falha ao excluir usuário'
      });
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (resetFormData.newPassword !== resetFormData.confirmPassword) {
      toast({
        variant: 'destructive',
        title: 'Erro de Validação',
        description: 'As senhas não coincidem'
      });
      return;
    }

    if (resetFormData.newPassword.length < 6) {
      toast({
        variant: 'destructive',
        title: 'Erro de Validação',
        description: 'A senha deve ter pelo menos 6 caracteres'
      });
      return;
    }

    if (!selectedUser || !functions) return;

    try {
      const resetPassword = httpsCallable(functions, 'resetUserPasswordAction');
      const result = await retryFirebaseFunction(
        () => resetPassword({ uid: selectedUser.uid, newPassword: resetFormData.newPassword }),
        'resetUserPasswordAction'
      );

      if (result.data && (result.data as any).success) {
        toast({
          title: 'Sucesso',
          description: 'Senha redefinida com sucesso'
        });
        setShowResetPasswordDialog(false);
        setResetFormData({ newPassword: '', confirmPassword: '' });
        setSelectedUser(null);
      } else {
        toast({
          variant: 'destructive',
          title: 'Erro',
          description: (result.data as any)?.message || 'Falha ao redefinir senha'
        });
      }
    } catch (error) {
      console.error('Erro ao redefinir senha:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Falha ao redefinir senha'
      });
    }
  };

  const handleToggleAccount = async (user: User) => {
    if (!functions) return;

    const action = user.isActive ? 'desativar' : 'ativar';
    if (!confirm(`Tem certeza que deseja ${action} a conta de ${user.email}?`)) {
      return;
    }

    try {
      const toggleAccount = httpsCallable(functions, 'toggleUserAccountAction');
      const result = await retryFirebaseFunction(
        () => toggleAccount({ uid: user.uid, isActive: !user.isActive, reason: 'MANUAL_ADMIN' }),
        'toggleUserAccountAction'
      );

      if (result.data && (result.data as any).success) {
        toast({
          title: 'Sucesso',
          description: `Conta ${action} com sucesso`
        });
        fetchUsers();
      } else {
        toast({
          variant: 'destructive',
          title: 'Erro',
          description: (result.data as any)?.message || `Falha ao ${action} conta`
        });
      }
    } catch (error) {
      console.error(`Erro ao ${action} conta:`, error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: `Falha ao ${action} conta`
      });
    }
  };

  const handleUpdateValidity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !functions) return;

    try {
      const updateValidity = httpsCallable(functions, 'updateUserValidityAction');
      const payload: any = { uid: selectedUser.uid };

      if (accountValidityFormData.removeValidity) {
        payload.removeValidity = true;
      } else if (accountValidityFormData.validityMonths && accountValidityFormData.validityMonths > 0) {
        payload.validityMonths = accountValidityFormData.validityMonths;
      } else if (accountValidityFormData.validUntil) {
        payload.validUntil = new Date(accountValidityFormData.validUntil);
      }

      const result = await retryFirebaseFunction(
        () => updateValidity(payload),
        'updateUserValidityAction'
      );

      if (result.data && (result.data as any).success) {
        toast({
          title: 'Sucesso',
          description: (result.data as any).message
        });
        setShowAccountValidityDialog(false);
        setAccountValidityFormData({ validityMonths: undefined, validUntil: '', removeValidity: false });
        setSelectedUser(null);
        fetchUsers();
      } else {
        toast({
          variant: 'destructive',
          title: 'Erro',
          description: (result.data as any)?.message || 'Falha ao atualizar validade'
        });
      }
    } catch (error) {
      console.error('Erro ao atualizar validade:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Falha ao atualizar validade'
      });
    }
  };

  const handleDeactivateExpiredAccounts = async () => {
    if (!functions) return;

    if (!confirm('Tem certeza que deseja desativar todas as contas expiradas?')) {
      return;
    }

    try {
      const deactivateExpired = httpsCallable(functions, 'deactivateExpiredAccountsAction');
      const result = await retryFirebaseFunction(
        () => deactivateExpired({}),
        'deactivateExpiredAccountsAction'
      );

      if (result.data && (result.data as any).success) {
        toast({
          title: 'Sucesso',
          description: (result.data as any).message
        });
        fetchUsers();
      } else {
        toast({
          variant: 'destructive',
          title: 'Erro',
          description: (result.data as any)?.message || 'Falha ao desativar contas expiradas'
        });
      }
    } catch (error) {
      console.error('Erro ao desativar contas expiradas:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Falha ao desativar contas expiradas'
      });
    }
  };

  const handleMigrateExistingUsers = async () => {
    if (!functions) return;

    if (!confirm('Tem certeza que deseja migrar todos os usuários existentes para adicionar o campo isActive? Esta ação só precisa ser executada uma vez.')) {
      return;
    }

    try {
      const migrateUsers = httpsCallable(functions, 'migrateExistingUsersAction');
      const result = await retryFirebaseFunction(
        () => migrateUsers({}),
        'migrateExistingUsersAction'
      );

      if (result.data && (result.data as any).success) {
        toast({
          title: 'Sucesso',
          description: (result.data as any).message
        });
        fetchUsers();
      } else {
        toast({
          variant: 'destructive',
          title: 'Erro',
          description: (result.data as any)?.message || 'Falha ao migrar usuários existentes'
        });
      }
    } catch (error) {
      console.error('Erro ao migrar usuários existentes:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Falha ao migrar usuários existentes'
      });
    }
  };

  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * usersPerPage,
    currentPage * usersPerPage
  );

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <Button variant="ghost" asChild className="mb-4">
          <Link href="/admin">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar ao Painel
          </Link>
        </Button>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Administração de Usuários</h1>
          <p className="text-muted-foreground">Gerencie usuários e autenticação 2FA</p>
        </div>
        <div className="flex gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar usuários..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-64"
            />
          </div>
          <Button onClick={fetchUsers} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={handleDeactivateExpiredAccounts} variant="outline" size="sm">
            <Ban className="h-4 w-4 mr-2" />
            Desativar Expiradas
          </Button>
          <Button onClick={handleMigrateExistingUsers} variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            Migrar Usuários
          </Button>
          <Button onClick={() => setShowCreateDialog(true)} size="sm">
            <UserPlus className="h-4 w-4 mr-2" />
            Novo Usuário
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Usuários Cadastrados
            <Badge variant="secondary">{totalUsers}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>2FA</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedUsers.map((user) => (
                  <TableRow key={user.uid}>
                    <TableCell className="font-medium">{user.email}</TableCell>
                    <TableCell>
                      <Badge variant={user.isAdmin ? "default" : "secondary"}>
                        {user.isAdmin ? "Admin" : "Comum"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.twoFactorEnabled ? "default" : "destructive"}>
                        {user.twoFactorEnabled ? (
                          <div className="flex items-center gap-1">
                            <ShieldCheck className="h-4 w-4" />
                            Ativo
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <ShieldX className="h-4 w-4" />
                            Inativo
                          </div>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.isActive !== false ? "default" : "destructive"}>
                        {user.isActive !== false ? (
                          <div className="flex items-center gap-1">
                            <CheckCircle className="h-4 w-4" />
                            Ativo
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Ban className="h-4 w-4" />
                            {user.deactivationReason === 'EXPIRED' ? 'Expirado' : 'Desativado'}
                          </div>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {user.validUntil ? (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            <span className={new Date(user.validUntil) < new Date() ? "text-red-600 font-medium" : ""}>
                              {new Date(user.validUntil).toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            <span>Permanente</span>
                          </div>
                        )}
                        {user.validityMonths && (
                          <div className="text-xs text-muted-foreground">
                            {user.validityMonths} meses
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground">
                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString('pt-BR') : 'N/A'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleToggle2FA(user)}
                          variant="outline"
                          size="sm"
                          title="Alternar 2FA"
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Button
                          onClick={() => {
                            setSelectedUser(user);
                            setShowResetPasswordDialog(true);
                            setResetFormData({ newPassword: '', confirmPassword: '' });
                          }}
                          variant="outline"
                          size="sm"
                          title="Redefinir Senha"
                        >
                          <Lock className="h-4 w-4" />
                        </Button>
                        <Button
                          onClick={() => {
                            setSelectedUser(user);
                            setShowAccountValidityDialog(true);
                            setAccountValidityFormData({
                              validityMonths: user.validityMonths || undefined,
                              validUntil: user.validUntil ? new Date(user.validUntil).toISOString().split('T')[0] : '',
                              removeValidity: false
                            });
                          }}
                          variant="outline"
                          size="sm"
                          title="Gerenciar Validade"
                        >
                          <Calendar className="h-4 w-4" />
                        </Button>
                        <Button
                          onClick={() => handleToggleAccount(user)}
                          variant={user.isActive !== false ? "outline" : "default"}
                          size="sm"
                          title={user.isActive !== false ? "Desativar Conta" : "Ativar Conta"}
                        >
                          {user.isActive !== false ? <Ban className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                        </Button>
                        <Button
                          onClick={() => handleDeleteUser(user)}
                          variant="destructive"
                          size="sm"
                          title="Excluir Usuário"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        {totalPages > 1 && (
          <CardFooter className="flex justify-between items-center">
            <div className="text-sm text-muted-foreground">
              Mostrando {(currentPage - 1) * usersPerPage + 1} a {Math.min(currentPage * usersPerPage, totalUsers)} de {totalUsers} usuários
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                variant="outline"
                size="sm"
              >
                Anterior
              </Button>
              <Button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                variant="outline"
                size="sm"
              >
                Próximo
              </Button>
            </div>
          </CardFooter>
        )}
      </Card>

      {/* Dialog para criar usuário */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Usuário</DialogTitle>
            <DialogDescription>
              Crie uma nova conta de usuário para o sistema.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateUser}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="usuario@exemplo.com"
                  value={createFormData.email}
                  onChange={(e) => setCreateFormData({ ...createFormData, email: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={createFormData.password}
                  onChange={(e) => setCreateFormData({ ...createFormData, password: e.target.value })}
                  required
                  minLength={6}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="isAdmin"
                  checked={createFormData.isAdmin}
                  onCheckedChange={(checked) => setCreateFormData({ ...createFormData, isAdmin: checked })}
                />
                <Label htmlFor="isAdmin">Administrador</Label>
              </div>
              <div className="space-y-2">
                <Label htmlFor="validityMonths">Validade da Conta (meses)</Label>
                <Input
                  id="validityMonths"
                  type="number"
                  placeholder="Deixe em branco para conta permanente"
                  value={createFormData.validityMonths || ''}
                  onChange={(e) => setCreateFormData({ ...createFormData, validityMonths: e.target.value ? parseInt(e.target.value) : undefined })}
                  min="1"
                  max="120"
                />
                <p className="text-xs text-muted-foreground">
                  Opcional. Define por quantos meses a conta será válida.
                </p>
              </div>
            </div>
          </form>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
            >
              Cancelar
            </Button>
            <Button type="submit">
              Criar Usuário
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para redefinir senha */}
      <Dialog open={showResetPasswordDialog} onOpenChange={setShowResetPasswordDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Redefinir Senha</DialogTitle>
            <DialogDescription>
              Redefina a senha para o usuário: {selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleResetPassword}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">Nova Senha</Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={resetFormData.newPassword}
                  onChange={(e) => setResetFormData({ ...resetFormData, newPassword: e.target.value })}
                  required
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar Senha</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirme a nova senha"
                  value={resetFormData.confirmPassword}
                  onChange={(e) => setResetFormData({ ...resetFormData, confirmPassword: e.target.value })}
                  required
                  minLength={6}
                />
              </div>
            </div>
          </form>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowResetPasswordDialog(false);
                setResetFormData({ newPassword: '', confirmPassword: '' });
                setSelectedUser(null);
              }}
            >
              Cancelar
            </Button>
            <Button type="submit">
              Redefinir Senha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para gerenciar validade da conta */}
      <Dialog open={showAccountValidityDialog} onOpenChange={setShowAccountValidityDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Gerenciar Validade da Conta</DialogTitle>
            <DialogDescription>
              Configure a validade da conta para: {selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateValidity}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Opções de Validade</Label>
                <Tabs value={accountValidityFormData.removeValidity ? 'remove' : accountValidityFormData.validityMonths ? 'months' : 'date'} onValueChange={(value) => {
                  if (value === 'remove') {
                    setAccountValidityFormData({ ...accountValidityFormData, removeValidity: true, validityMonths: undefined, validUntil: '' });
                  } else if (value === 'months') {
                    setAccountValidityFormData({ ...accountValidityFormData, removeValidity: false, validityMonths: 1, validUntil: '' });
                  } else {
                    setAccountValidityFormData({ ...accountValidityFormData, removeValidity: false, validityMonths: undefined, validUntil: new Date().toISOString().split('T')[0] });
                  }
                }}>
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="months">Meses</TabsTrigger>
                    <TabsTrigger value="date">Data Específica</TabsTrigger>
                    <TabsTrigger value="remove">Remover</TabsTrigger>
                  </TabsList>
                  <TabsContent value="months" className="space-y-2">
                    <Label htmlFor="validityMonths">Número de Meses</Label>
                    <Input
                      id="validityMonths"
                      type="number"
                      placeholder="Ex: 12 para 1 ano"
                      value={accountValidityFormData.validityMonths || ''}
                      onChange={(e) => setAccountValidityFormData({ ...accountValidityFormData, validityMonths: e.target.value ? parseInt(e.target.value) : undefined })}
                      min="1"
                      max="120"
                      required
                    />
                  </TabsContent>
                  <TabsContent value="date" className="space-y-2">
                    <Label htmlFor="validUntil">Data de Expiração</Label>
                    <Input
                      id="validUntil"
                      type="date"
                      value={accountValidityFormData.validUntil}
                      onChange={(e) => setAccountValidityFormData({ ...accountValidityFormData, validUntil: e.target.value })}
                      min={new Date().toISOString().split('T')[0]}
                      required
                    />
                  </TabsContent>
                  <TabsContent value="remove" className="space-y-2">
                    <div className="text-sm text-muted-foreground">
                      <p>Remover a validade tornará a conta permanente.</p>
                      <p className="font-medium text-foreground mt-1">Deseja continuar?</p>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </form>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowAccountValidityDialog(false);
                setAccountValidityFormData({ validityMonths: undefined, validUntil: '', removeValidity: false });
                setSelectedUser(null);
              }}
            >
              Cancelar
            </Button>
            <Button type="submit">
              {accountValidityFormData.removeValidity ? 'Remover Validade' : 'Atualizar Validade'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
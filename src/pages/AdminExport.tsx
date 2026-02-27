import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Download, Copy, Check, ArrowLeft, Database, Code, Shield } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const TABLES = [
  { name: 'profiles', label: 'Perfis', icon: '👤' },
  { name: 'presence', label: 'Presenças', icon: '📍' },
  { name: 'places', label: 'Locais', icon: '🏠' },
  { name: 'waves', label: 'Waves', icon: '👋' },
  { name: 'conversations', label: 'Conversas', icon: '💬' },
  { name: 'messages', label: 'Mensagens', icon: '✉️' },
  { name: 'user_interests', label: 'Interesses', icon: '🏷️' },
  { name: 'user_blocks', label: 'Bloqueios', icon: '🚫' },
  { name: 'user_mutes', label: 'Silenciamentos', icon: '🔇' },
  { name: 'intentions', label: 'Intenções', icon: '🎯' },
  { name: 'locations', label: 'Localizações', icon: '📌' },
  { name: 'user_roles', label: 'Roles', icon: '🔑' },
];

export default function AdminExport() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loadingCounts, setLoadingCounts] = useState(true);
  const [exportingTable, setExportingTable] = useState<string | null>(null);
  const [schemaSQL, setSchemaSQL] = useState('');
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [copied, setCopied] = useState(false);

  // Check admin role
  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    checkAdminRole();
  }, [user]);

  const checkAdminRole = async () => {
    try {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user!.id)
        .eq('role', 'admin')
        .maybeSingle();
      
      if (!data) {
        setIsAdmin(false);
        toast({
          title: 'Acesso negado',
          description: 'Você não tem permissão de administrador.',
          variant: 'destructive',
        });
        return;
      }
      setIsAdmin(true);
      fetchCounts();
      fetchSchema();
    } catch {
      setIsAdmin(false);
    }
  };

  const fetchCounts = async () => {
    setLoadingCounts(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-export', {
        body: null,
        method: 'GET',
      });
      
      // Use query params approach
      const response = await supabase.functions.invoke('admin-export?action=counts');
      if (response.data?.counts) {
        setCounts(response.data.counts);
      }
    } catch (err) {
      console.error('Error fetching counts:', err);
    } finally {
      setLoadingCounts(false);
    }
  };

  const fetchSchema = async () => {
    setLoadingSchema(true);
    try {
      const response = await supabase.functions.invoke('admin-export?action=schema');
      if (response.data?.schema) {
        setSchemaSQL(response.data.schema);
      }
    } catch (err) {
      console.error('Error fetching schema:', err);
    } finally {
      setLoadingSchema(false);
    }
  };

  const exportTable = async (tableName: string) => {
    setExportingTable(tableName);
    try {
      const response = await supabase.functions.invoke(`admin-export?action=export&table=${tableName}`);
      
      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data?.csv) {
        toast({
          title: 'Tabela vazia',
          description: `A tabela ${tableName} não possui dados.`,
        });
        return;
      }

      // Download CSV
      const blob = new Blob([response.data.csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `katuu_${tableName}_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: 'Exportado!',
        description: `${response.data.count} registros exportados de ${tableName}.`,
      });
    } catch (err: any) {
      toast({
        title: 'Erro na exportação',
        description: err.message || 'Erro ao exportar tabela.',
        variant: 'destructive',
      });
    } finally {
      setExportingTable(null);
    }
  };

  const exportAllTables = async () => {
    for (const table of TABLES) {
      await exportTable(table.name);
    }
  };

  const copySchema = async () => {
    try {
      await navigator.clipboard.writeText(schemaSQL);
      setCopied(true);
      toast({ title: 'Copiado!', description: 'SQL do schema copiado para a área de transferência.' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível copiar.', variant: 'destructive' });
    }
  };

  if (!user) return null;

  if (isAdmin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 p-6">
        <Shield className="h-16 w-16 text-destructive" />
        <h1 className="text-2xl font-bold text-foreground">Acesso Restrito</h1>
        <p className="text-muted-foreground text-center">
          Esta página é exclusiva para administradores.
        </p>
        <Button onClick={() => navigate('/home')} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate('/home')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Admin Export</h1>
            <p className="text-sm text-muted-foreground">
              Exportar dados e schema do banco de dados
            </p>
          </div>
        </div>

        <Tabs defaultValue="csv" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="csv" className="flex-1 gap-2">
              <Database className="h-4 w-4" />
              Exportar CSV
            </TabsTrigger>
            <TabsTrigger value="sql" className="flex-1 gap-2">
              <Code className="h-4 w-4" />
              Schema SQL
            </TabsTrigger>
          </TabsList>

          {/* CSV Export Tab */}
          <TabsContent value="csv" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={exportAllTables} variant="outline" size="sm">
                <Download className="mr-2 h-4 w-4" />
                Exportar Tudo
              </Button>
            </div>

            <div className="grid gap-3">
              {TABLES.map((table) => (
                <Card key={table.name} className="border-border">
                  <CardContent className="flex items-center justify-between py-3 px-4">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{table.icon}</span>
                      <div>
                        <p className="font-medium text-foreground">{table.label}</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {table.name}
                          {counts[table.name] !== undefined && (
                            <span className="ml-2">
                              • {counts[table.name]} registros
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exportTable(table.name)}
                      disabled={exportingTable !== null}
                    >
                      {exportingTable === table.name ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* SQL Schema Tab */}
          <TabsContent value="sql" className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                SQL completo para recriar as tabelas em outro projeto
              </p>
              <Button onClick={copySchema} variant="outline" size="sm">
                {copied ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Copiar SQL
                  </>
                )}
              </Button>
            </div>

            <Card className="border-border">
              <CardContent className="p-0">
                {loadingSchema ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <pre className="p-4 text-xs font-mono text-foreground overflow-x-auto max-h-[60vh] overflow-y-auto whitespace-pre bg-muted/30 rounded-lg">
                    {schemaSQL}
                  </pre>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

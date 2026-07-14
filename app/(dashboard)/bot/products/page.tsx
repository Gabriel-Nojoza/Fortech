"use client"

import { useState } from "react"
import useSWR, { mutate } from "swr"
import { Loader2, Package, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/dashboard/page-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"

type BotProduct = {
  id: string
  name: string
  price: number
  description: string | null
  category: string | null
  stock: number | null
  image_url: string | null
  is_active: boolean
}

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data?.error || "Erro ao carregar dados")
  }

  return data
}

function formatPrice(price: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(price)
}

export default function BotProductsPage() {
  const listKey = "/api/bot/products"
  const { data, isLoading, error } = useSWR<BotProduct[]>(listKey, fetcher)
  const products = Array.isArray(data) ? data : []

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<BotProduct | null>(null)
  const [formName, setFormName] = useState("")
  const [formPrice, setFormPrice] = useState("")
  const [formDescription, setFormDescription] = useState("")
  const [formCategory, setFormCategory] = useState("")
  const [formStock, setFormStock] = useState("")
  const [formImageUrl, setFormImageUrl] = useState("")
  const [formIsActive, setFormIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function openCreate() {
    setEditingProduct(null)
    setFormName("")
    setFormPrice("")
    setFormDescription("")
    setFormCategory("")
    setFormStock("")
    setFormImageUrl("")
    setFormIsActive(true)
    setDialogOpen(true)
  }

  function openEdit(product: BotProduct) {
    setEditingProduct(product)
    setFormName(product.name)
    setFormPrice(String(product.price))
    setFormDescription(product.description ?? "")
    setFormCategory(product.category ?? "")
    setFormStock(product.stock === null ? "" : String(product.stock))
    setFormImageUrl(product.image_url ?? "")
    setFormIsActive(product.is_active)
    setDialogOpen(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const price = Number(formPrice.replace(",", "."))
      if (Number.isNaN(price) || price < 0) {
        throw new Error("Preco invalido")
      }
      const stock = formStock.trim() ? Number(formStock) : null
      if (stock !== null && !Number.isInteger(stock)) {
        throw new Error("Estoque invalido")
      }

      const payload = {
        name: formName,
        price,
        description: formDescription || null,
        category: formCategory || null,
        stock,
        image_url: formImageUrl || null,
        is_active: formIsActive,
      }

      const response = await fetch(
        editingProduct ? `${listKey}/${editingProduct.id}` : listKey,
        {
          method: editingProduct ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      )
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        const message =
          typeof result?.error === "string"
            ? result.error
            : result?.error
              ? JSON.stringify(result.error)
              : "Erro ao salvar produto"
        throw new Error(message)
      }

      setDialogOpen(false)
      await mutate(listKey)
      toast.success(editingProduct ? "Produto atualizado." : "Produto criado.")
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Erro ao salvar produto")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(product: BotProduct) {
    setDeletingId(product.id)
    try {
      const response = await fetch(`${listKey}/${product.id}`, { method: "DELETE" })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(result?.error || "Erro ao remover produto")
      }

      await mutate(listKey)
      toast.success("Produto removido.")
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : "Erro ao remover produto")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title="Produtos" description="Cadastre o catalogo de produtos usado pelo bot.">
        <Button onClick={openCreate} size="sm">
          <Plus className="mr-2 size-4" />
          Novo produto
        </Button>
      </PageHeader>

      <div className="p-4 sm:p-6">
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-3 p-6">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-14 rounded-lg" />
                ))}
              </div>
            ) : error ? (
              <div className="p-6 text-sm text-muted-foreground">
                {error instanceof Error ? error.message : "Erro ao carregar produtos."}
              </div>
            ) : products.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                Nenhum produto cadastrado ainda.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left">
                      <th className="px-4 py-3 font-medium text-muted-foreground">Produto</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Categoria</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Preco</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Estoque</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Acoes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {products.map((product) => (
                      <tr key={product.id} className="transition-colors hover:bg-muted/20">
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-start gap-3">
                            <div className="rounded-lg border bg-muted/20 p-2">
                              <Package className="size-4" />
                            </div>
                            <div>
                              <p className="font-medium">{product.name}</p>
                              {product.description ? (
                                <p className="max-w-xs truncate text-xs text-muted-foreground">
                                  {product.description}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">{product.category || "-"}</td>
                        <td className="px-4 py-3 align-top">{formatPrice(product.price)}</td>
                        <td className="px-4 py-3 align-top">
                          {product.stock === null ? "-" : product.stock}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <Badge variant={product.is_active ? "default" : "secondary"}>
                            {product.is_active ? "Ativo" : "Inativo"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => openEdit(product)}>
                              <Pencil className="mr-2 size-4" />
                              Editar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(product)}
                              disabled={deletingId === product.id}
                            >
                              {deletingId === product.id ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Trash2 className="size-4 text-destructive" />
                              )}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Editar produto" : "Novo produto"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="product-name">Nome</Label>
              <Input id="product-name" value={formName} onChange={(event) => setFormName(event.target.value)} />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="product-price">Preco (R$)</Label>
                <Input
                  id="product-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formPrice}
                  onChange={(event) => setFormPrice(event.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="product-category">Categoria</Label>
                <Input
                  id="product-category"
                  value={formCategory}
                  onChange={(event) => setFormCategory(event.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="product-stock">Estoque</Label>
                <Input
                  id="product-stock"
                  type="number"
                  step="1"
                  value={formStock}
                  onChange={(event) => setFormStock(event.target.value)}
                  placeholder="Ilimitado"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="product-image">URL da imagem</Label>
              <Input
                id="product-image"
                value={formImageUrl}
                onChange={(event) => setFormImageUrl(event.target.value)}
                placeholder="https://..."
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="product-description">Descricao</Label>
              <Textarea
                id="product-description"
                value={formDescription}
                onChange={(event) => setFormDescription(event.target.value)}
                rows={3}
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={formIsActive} onCheckedChange={setFormIsActive} />
              <span className="text-sm">{formIsActive ? "Produto ativo" : "Produto inativo"}</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || !formName.trim() || !formPrice.trim()}>
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {editingProduct ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

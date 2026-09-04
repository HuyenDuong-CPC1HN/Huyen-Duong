function fail(error) { if (error) throw new Error(error.message || String(error)) }

function toInvoiceRow(recordId, invoice, index) {
  return {
    record_id: recordId,
    mau_so: invoice.mauSo || '',
    ky_hieu: invoice.kyHieu || '',
    so_hoa_don: invoice.soHoaDon || '',
    ngay_lap_hd: invoice.ngayLapHD || '',
    ten_hang_hoa: invoice.tenHangHoa || '',
    so_luong: invoice.soLuong || '',
    gia_tri: invoice.giaTri || '',
    sort_order: index,
  }
}

function toProductRow(recordId, product, index) {
  return {
    record_id: recordId,
    ten_hang: product.tenHang || '',
    so_lo: product.soLo || '',
    han_dung: product.hanDung || '',
    don_vi_tinh: product.donViTinh || '',
    so_luong: product.soLuong || '',
    quy_cach: product.quyCach || '',
    tinh_trang: product.tinhTrang || 'Hàng nguyên vẹn',
    sort_order: index,
  }
}

function fromInvoiceRow(row) {
  return {
    mauSo: row.mau_so || '', kyHieu: row.ky_hieu || '', soHoaDon: row.so_hoa_don || '',
    ngayLapHD: row.ngay_lap_hd || '', tenHangHoa: row.ten_hang_hoa || '', soLuong: row.so_luong || '',
    giaTri: row.gia_tri || '',
  }
}

function fromProductRow(row) {
  return {
    tenHang: row.ten_hang || '', soLo: row.so_lo || '', hanDung: row.han_dung || '',
    donViTinh: row.don_vi_tinh || '', soLuong: row.so_luong || '', quyCach: row.quy_cach || '',
    tinhTrang: row.tinh_trang || 'Hàng nguyên vẹn',
  }
}

function fromRecordRow(record, invoicesByRecord, productsByRecord) {
  return {
    id: record.id,
    entity: record.entity,
    year: record.year,
    month: record.month,
    customerName: record.customer_name || '',
    customerAddress: record.customer_address || '',
    customerPhone: record.customer_phone || '',
    customerMst: record.customer_mst || '',
    returnReason: record.return_reason || '',
    giaTriBangChu: record.gia_tri_bang_chu || '',
    verifyDatetime: record.verify_datetime || null,
    verifyLocation: record.verify_location || '',
    verifyResult: record.verify_result || '',
    repAccounting: record.rep_accounting || '',
    repSales: record.rep_sales || '',
    status: record.status || 'draft',
    createdAt: record.created_at,
    invoices: (invoicesByRecord.get(record.id) || []).map(fromInvoiceRow),
    products: (productsByRecord.get(record.id) || []).map(fromProductRow),
  }
}

function groupByRecordId(rows) {
  const map = new Map()
  for (const row of rows || []) {
    const list = map.get(row.record_id) || []
    list.push(row)
    map.set(row.record_id, list)
  }
  return map
}

export function createReturnRecordsRepository(client) {
  const recordTable = () => client.from('return_records')
  const invoiceTable = () => client.from('return_record_invoices')
  const productTable = () => client.from('return_record_products')

  return {
    // Tải toàn bộ bản ghi (mọi entity/năm/tháng) kèm hóa đơn/hàng hóa con — lọc theo entity/năm/tháng ở phía client.
    async listAll() {
      const [recordsResult, invoicesResult, productsResult] = await Promise.all([
        recordTable().select('*').order('created_at', { ascending: false }),
        invoiceTable().select('*').order('sort_order'),
        productTable().select('*').order('sort_order'),
      ])
      fail(recordsResult.error)
      fail(invoicesResult.error)
      fail(productsResult.error)
      const invoicesByRecord = groupByRecordId(invoicesResult.data)
      const productsByRecord = groupByRecordId(productsResult.data)
      return (recordsResult.data || []).map(record => fromRecordRow(record, invoicesByRecord, productsByRecord))
    },

    async save(record) {
      const row = {
        id: record.id,
        entity: record.entity,
        year: record.year,
        month: record.month,
        customer_name: record.customerName || '',
        customer_address: record.customerAddress || '',
        customer_phone: record.customerPhone || '',
        customer_mst: record.customerMst || '',
        return_reason: record.returnReason || '',
        gia_tri_bang_chu: record.giaTriBangChu || '',
        verify_datetime: record.verifyDatetime || null,
        verify_location: record.verifyLocation || '',
        verify_result: record.verifyResult || '',
        rep_accounting: record.repAccounting || '',
        rep_sales: record.repSales || '',
        status: record.status || 'draft',
      }
      fail((await recordTable().upsert(row)).error)

      fail((await invoiceTable().delete().eq('record_id', record.id)).error)
      const invoices = (record.invoices || []).map((inv, i) => toInvoiceRow(record.id, inv, i))
      if (invoices.length > 0) fail((await invoiceTable().insert(invoices)).error)

      fail((await productTable().delete().eq('record_id', record.id)).error)
      const products = (record.products || []).map((p, i) => toProductRow(record.id, p, i))
      if (products.length > 0) fail((await productTable().insert(products)).error)

      return record
    },

    async remove(id) {
      fail((await invoiceTable().delete().eq('record_id', id)).error)
      fail((await productTable().delete().eq('record_id', id)).error)
      fail((await recordTable().delete().eq('id', id)).error)
    },
  }
}

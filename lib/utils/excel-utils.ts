import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import { Medicine } from '@/lib/api/medicines'

export interface ExcelMedicineRow {
  name: string
  generic_name?: string
  brand_name?: string
  strength?: string
  form?: string
  category?: string
  supplier?: string
  stock_quantity: number
  minimum_stock: number
  unit_price: number
  expiry_date?: string
  prescription_required?: boolean
  description?: string
  barcode?: string
}

export interface ExcelExportData {
  medicines?: Medicine[]
  sales?: any[]
  customers?: any[]
  prescriptions?: any[]
}

export const importMedicinesFromExcel = (file: File): Promise<ExcelMedicineRow[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
        
        // Skip header row and convert to our format
        const headers = jsonData[0] as string[]
        const rows = jsonData.slice(1) as any[][]
        
        const medicines: ExcelMedicineRow[] = rows.map((row) => {
          const medicine: any = {}
          headers.forEach((header, index) => {
            const value = row[index]
            if (value !== undefined && value !== null) {
              // Convert header to camelCase and map to our interface
              const key = header.toLowerCase().replace(/\s+/g, '_')
              medicine[key] = value
            }
          })
          
          // Ensure required fields are present
          if (!medicine.name || !medicine.stock_quantity || !medicine.unit_price) {
            throw new Error(`Missing required fields in row: ${row.join(', ')}`)
          }
          
          return medicine as ExcelMedicineRow
        })
        
        resolve(medicines)
      } catch (error) {
        reject(new Error(`Failed to parse Excel file: ${error}`))
      }
    }
    
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}

export const exportToExcel = (data: ExcelExportData, filename: string) => {
  const workbook = XLSX.utils.book_new()
  
  // Export medicines if available
  if (data.medicines && data.medicines.length > 0) {
    const medicinesData = data.medicines.map(medicine => ({
      'Medicine Name': medicine.name,
      'Generic Name': medicine.generic_name || '',
      'Brand Name': medicine.brand_name || '',
      'Strength': medicine.strength || '',
      'Form': medicine.form || '',
      'Category': medicine.categories?.name || '',
      'Supplier': medicine.suppliers?.name || '',
      'Stock Quantity': medicine.stock_quantity,
      'Minimum Stock': medicine.minimum_stock,
      'Unit Price': medicine.unit_price,
      'Expiry Date': medicine.expiry_date ? new Date(medicine.expiry_date).toLocaleDateString() : '',
      'Prescription Required': medicine.prescription_required ? 'Yes' : 'No',
      'Description': medicine.description || '',
      'Barcode': medicine.barcode || ''
    }))
    
    const medicinesSheet = XLSX.utils.json_to_sheet(medicinesData)
    XLSX.utils.book_append_sheet(workbook, medicinesSheet, 'Medicines')
  }
  
  // Export sales if available
  if (data.sales && data.sales.length > 0) {
    const salesData = data.sales.map(sale => ({
      'Sale ID': sale.id,
      'Date': new Date(sale.sale_date).toLocaleDateString(),
      'Customer': sale.customers ? `${sale.customers.first_name} ${sale.customers.last_name}` : 'Walk-in',
      'Total Amount': sale.total_amount,
      'Payment Method': sale.payment_method || '',
      'Status': sale.status || ''
    }))
    
    const salesSheet = XLSX.utils.json_to_sheet(salesData)
    XLSX.utils.book_append_sheet(workbook, salesSheet, 'Sales')
  }
  
  // Export customers if available
  if (data.customers && data.customers.length > 0) {
    const customersData = data.customers.map(customer => ({
      'Customer ID': customer.id,
      'First Name': customer.first_name,
      'Last Name': customer.last_name,
      'Email': customer.email || '',
      'Phone': customer.phone || '',
      'Address': customer.address || '',
      'Date of Birth': customer.date_of_birth ? new Date(customer.date_of_birth).toLocaleDateString() : '',
      'Registration Date': new Date(customer.created_at).toLocaleDateString()
    }))
    
    const customersSheet = XLSX.utils.json_to_sheet(customersData)
    XLSX.utils.book_append_sheet(workbook, customersSheet, 'Customers')
  }
  
  // Export prescriptions if available
  if (data.prescriptions && data.prescriptions.length > 0) {
    const prescriptionsData = data.prescriptions.map(prescription => ({
      'Prescription ID': prescription.id,
      'Customer': prescription.customers ? `${prescription.customers.first_name} ${prescription.customers.last_name}` : '',
      'Medicine': prescription.medicines?.name || '',
      'Dosage': prescription.dosage || '',
      'Duration': prescription.duration || '',
      'Status': prescription.status,
      'Prescribed Date': new Date(prescription.prescribed_date).toLocaleDateString(),
      'Expiry Date': prescription.expiry_date ? new Date(prescription.expiry_date).toLocaleDateString() : ''
    }))
    
    const prescriptionsSheet = XLSX.utils.json_to_sheet(prescriptionsData)
    XLSX.utils.book_append_sheet(workbook, prescriptionsSheet, 'Prescriptions')
  }
  
  // Generate and download the file
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  saveAs(blob, `${filename}.xlsx`)
}

export const generateInventoryTemplate = () => {
  const templateData = [
    {
      name: 'Sample Medicine',
      generic_name: 'Sample Generic',
      brand_name: 'Sample Brand',
      strength: '500mg',
      form: 'Tablet',
      category: 'Antibiotics',
      supplier: 'Sample Supplier',
      stock_quantity: 100,
      minimum_stock: 20,
      unit_price: 10.50,
      expiry_date: '2025-12-31',
      prescription_required: false,
      description: 'Sample description',
      barcode: '123456789'
    }
  ]
  
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(templateData)
  XLSX.utils.book_append_sheet(workbook, sheet, 'Template')
  
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  saveAs(blob, 'inventory_import_template.xlsx')
}

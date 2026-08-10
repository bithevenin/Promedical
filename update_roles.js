const fs = require('fs');
const path = require('path');

const files = [
  'src/app/pages/pacientes/pacientes.page.ts',
  'src/app/pages/dashboard/dashboard.page.ts',
  'src/app/pages/contabilidad/seguros-ars/seguros-ars.page.ts',
  'src/app/pages/contabilidad/contabilidad.page.ts',
  'src/app/pages/consulta/consulta.page.ts',
  'src/app/pages/configuracion/configuracion.page.ts',
  'src/app/pages/citas/citas.page.ts',
  'src/app/pages/main/main.page.html'
];

const workspacePath = 'c:/Users/Yer Perez/Desktop/Promedical';

files.forEach(file => {
  const fullPath = path.join(workspacePath, file);
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf8');
    
    // Replace the condition to include doctor
    content = content.replace(/profile\?\.rol === 'secretaria' \|\| profile\?\.rol === 'admin'/g, `profile?.rol === 'secretaria' || profile?.rol === 'admin' || profile?.rol === 'doctor'`);
    
    content = content.replace(/this\.currentProfile\(\)\?\.rol === 'secretaria' \|\| this\.currentProfile\(\)\?\.rol === 'admin'/g, `this.currentProfile()?.rol === 'secretaria' || this.currentProfile()?.rol === 'admin' || this.currentProfile()?.rol === 'doctor'`);
    
    fs.writeFileSync(fullPath, content);
    console.log('Updated', file);
  } else {
    console.log('Not found', file);
  }
});

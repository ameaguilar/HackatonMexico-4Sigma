// QR de texto de demostracion extraido del frontend V6; nunca representa un pago bancario.
  const SIZE=29, MAX_BYTES=53, DATA_CODEWORDS=55, EC_CODEWORDS=15;
  function mul(a,b){let result=0;while(b>0){if((b&1)!==0)result^=a;a=(a<<1)^((a&0x80)?0x11d:0);b>>=1;}return result;}
  function generator(degree){let poly=[1];let power=1;for(let i=0;i<degree;i++){const next=new Array(poly.length+1).fill(0);for(let j=0;j<poly.length;j++){next[j]^=poly[j];next[j+1]^=mul(poly[j],power);}poly=next;power=mul(power,2);}return poly;}
  function dataCodewords(text){const bytes=Array.from(new TextEncoder().encode(text));if(bytes.length>MAX_BYTES)throw Error('Texto QR demasiado largo');const bits=[];function add(value,n){for(let i=n-1;i>=0;i--)bits.push((value>>>i)&1);}add(4,4);add(bytes.length,8);bytes.forEach(b=>add(b,8));for(let i=0;i<4&&bits.length<DATA_CODEWORDS*8;i++)bits.push(0);while(bits.length%8)bits.push(0);const output=[];for(let i=0;i<bits.length;i+=8){let value=0;for(let j=0;j<8;j++)value=(value<<1)|bits[i+j];output.push(value);}while(output.length<DATA_CODEWORDS)output.push(output.length%2===0?0xEC:0x11);return output;}
  function ecc(data){const poly=generator(EC_CODEWORDS);const buffer=data.concat(new Array(EC_CODEWORDS).fill(0));for(let i=0;i<data.length;i++){const lead=buffer[i];for(let j=0;j<poly.length;j++)buffer[i+j]^=mul(poly[j],lead);}return buffer.slice(-EC_CODEWORDS);}
  function matrix(payload){const data=dataCodewords(payload),codewords=data.concat(ecc(data));const cells=Array.from({length:SIZE},()=>Array(SIZE).fill(null));const fixed=Array.from({length:SIZE},()=>Array(SIZE).fill(false));
    function set(x,y,v){if(x<0||y<0||x>=SIZE||y>=SIZE)return;cells[y][x]=!!v;fixed[y][x]=true;}
    function finder(x,y){for(let dy=-1;dy<=7;dy++)for(let dx=-1;dx<=7;dx++){const inFinder=(dx>=0&&dx<=6&&dy>=0&&dy<=6);const border=dx===0||dx===6||dy===0||dy===6;const core=dx>=2&&dx<=4&&dy>=2&&dy<=4;set(x+dx,y+dy,inFinder&&(border||core));}}
    finder(0,0);finder(SIZE-7,0);finder(0,SIZE-7);
    for(let i=8;i<SIZE-8;i++){set(i,6,i%2===0);set(6,i,i%2===0);}
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)set(22+dx,22+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1);
    // Reservar los módulos donde se escriben los bits de formato (L / máscara 0).
    for(let i=0;i<=5;i++)set(8,i,false);set(8,7,false);set(8,8,false);set(7,8,false);for(let i=9;i<15;i++)set(14-i,8,false);
    for(let i=0;i<8;i++)set(SIZE-1-i,8,false);for(let i=8;i<15;i++)set(8,SIZE-15+i,false);set(8,SIZE-8,true);
    const bits=[];codewords.forEach(byte=>{for(let i=7;i>=0;i--)bits.push((byte>>>i)&1);});let bi=0;
    for(let right=SIZE-1;right>=1;right-=2){if(right===6)right=5;const upwards=((right+1)&2)===0;for(let vert=0;vert<SIZE;vert++){const y=upwards?SIZE-1-vert:vert;for(let dx=0;dx<2;dx++){const x=right-dx;if(fixed[y][x])continue;let bit=bi<bits.length?bits[bi++]:0;if(((x+y)&1)===0)bit^=1;cells[y][x]=!!bit;}}}
    // Información de formato: nivel L, máscara 0, código BCH(15,5).
    const formatData=(1<<3)|0;let remainder=formatData;for(let i=0;i<10;i++)remainder=(remainder<<1)^(((remainder>>>9)&1)?0x537:0);const format=((formatData<<10)|remainder)^0x5412;const bit=i=>((format>>>i)&1)!==0;
    for(let i=0;i<=5;i++)set(8,i,bit(i));set(8,7,bit(6));set(8,8,bit(7));set(7,8,bit(8));for(let i=9;i<15;i++)set(14-i,8,bit(i));for(let i=0;i<8;i++)set(SIZE-1-i,8,bit(i));for(let i=8;i<15;i++)set(8,SIZE-15+i,bit(i));set(8,SIZE-8,true);
    return cells;
  }
  function svg(text){const m=matrix(text);let path='';for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)if(m[y][x])path+=`M${x+4} ${y+4}h1v1h-1z`;return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 37 37" width="100%" height="100%" role="img" aria-label="QR demostrativo; no permite pagar"><rect width="37" height="37" fill="#fff"/><path d="${path}" fill="#111"/></svg>`;}

export function demoQrSvg(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0.01 || value > 999999.99) throw new RangeError('Importe de demo fuera de rango');
  const payload = 'COBRAVOZ-DEMO|MXN:' + value.toFixed(2) + '|NO-PAGAR';
  return svg(payload).replace('<rect ', '<desc>' + payload + '</desc><rect ');
}

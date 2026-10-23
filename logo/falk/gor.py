# gör falkloggan: genomskinlig bakgrund (ljust läge) + lyfta skuggor (mörkt läge)
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
im=Image.open('original.png').convert('RGB'); a=np.asarray(im).astype(float)
h,w,_=a.shape
m=Image.fromarray(((a.min(2)>150)*255).astype('uint8')); fill=m.copy()
for p in [(0,0),(w-1,0),(0,h-1),(w-1,h-1)]: ImageDraw.floodfill(fill,p,128)
bg=np.asarray(fill)==128
alpha=np.ones((h,w)); b=a[...,2]
alpha[bg]=np.clip((238-b[bg])/200,0,1)
alpha=np.asarray(Image.fromarray((alpha*255).astype('uint8')).filter(ImageFilter.MinFilter(3))).astype(float)/255*0.5+alpha*0.5
A=alpha[...,None]
rgb=np.where(A>0.01,(a-(1-A)*255)/np.maximum(A,1e-3),0).clip(0,255)
o=Image.fromarray(np.dstack([rgb,alpha*255]).astype('uint8'),'RGBA')
o=o.crop(o.getchannel('A').point(lambda v:255 if v>8 else 0).getbbox())
s=int(max(o.size)*1.06); c=Image.new('RGBA',(s,s),(0,0,0,0)); c.paste(o,((s-o.size[0])//2,(s-o.size[1])//2))
c=c.resize((1024,1024),Image.LANCZOS); c.save('falk-ljus-1024.png')
d=np.asarray(c).astype(float); rgb=d[...,:3]
lum=(rgb*[.3,.59,.11]).sum(2)
lift=np.clip((150-lum)/150,0,1)[...,None]*0.38
rgb2=rgb+(np.array([255,120,70])-rgb)*lift
Image.fromarray(np.dstack([rgb2.clip(0,255),d[...,3]]).astype('uint8'),'RGBA').save('falk-mork-1024.png')

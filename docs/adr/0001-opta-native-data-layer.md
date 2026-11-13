# 数据层直接用 Opta，不经过 CDF，不复用 @threader/core

threader-desktop 有一套可移植的 `@threader/core`（战术投影、转换、定位球、进球回合、VAEP），但它建立在 CDF 规范化后的事件上。复用它就要先把 Opta 转成 CDF，还要跟着桌面端的模型一起演进。演示站只有 Opta 一个数据来源，所以数据层直接读 Opta 的事件和限定词。需要的算法参考桌面端的实现改写成 Opta 版本，不引用桌面端的代码。
